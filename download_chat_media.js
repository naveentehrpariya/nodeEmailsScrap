const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { MongoClient } = require('mongodb');

// Load credentials
const keys = require('./dispatch.json');
const userEmail = 'naveendev@crossmilescarrier.com';

const downloadChatMedia = async () => {
  try {
    console.log('🚀 Starting Gmail Chat media download...');
    
    // Set up authentication with Chat API scopes
    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      [
        'https://www.googleapis.com/auth/chat.spaces.readonly',
        'https://www.googleapis.com/auth/chat.messages.readonly',
        'https://www.googleapis.com/auth/chat.messages.reactions.readonly'
      ],
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });
    
    // Connect to database to find attachments without local files
    const client = new MongoClient('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net');
    await client.connect();
    const db = client.db('emails');
    
    // Find all chats and filter those with attachments
    console.log('🔍 Searching for chats with attachments...');
    const allChats = await db.collection('chats').find().toArray();
    console.log(`📊 Found ${allChats.length} total chats`);
    
    // Filter chats that have attachments
    const chats = allChats.filter(chat => 
      chat.messages && chat.messages.some(msg => 
        msg.attachments && msg.attachments.length > 0
      )
    );
    
    console.log(`📊 Found ${chats.length} chats with attachments`);
    
    const mediaDirectory = path.join(__dirname, 'media');
    if (!fs.existsSync(mediaDirectory)) {
      fs.mkdirSync(mediaDirectory, { recursive: true });
    }
    
    let downloadCount = 0;
    let failureCount = 0;
    let processedCount = 0;
    
    for (const chatDoc of chats) {
      console.log(`\n📁 Processing chat: ${chatDoc.spaceId}`);
      
      for (const message of chatDoc.messages) {
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            const filename = attachment.filename || attachment.contentName;
            const filePath = path.join(mediaDirectory, filename);
            
            // Skip if attachment already has localPath (means we've processed it)
            if (attachment.localPath) {
              console.log(`✅ Already has localPath: ${filename}`);
              continue;
            }
            
            // Also skip if no filename
            if (!filename) {
              console.log(`⚠️ No filename for attachment ${attachment._id}`);
              continue;
            }
            
            // Skip if file already exists locally (avoid duplicates)
            if (fs.existsSync(filePath)) {
              console.log(`ℹ️ File exists but no localPath set, updating DB: ${filename}`);
              // Update database with localPath since file exists
              await db.collection('chats').updateOne(
                {
                  '_id': chatDoc._id
                },
                {
                  $set: {
                    'messages.$[msg].attachments.$[att].localPath': `/media/${filename}`
                  }
                },
                {
                  arrayFilters: [
                    { 'msg._id': message._id },
                    { 'att._id': attachment._id }
                  ]
                }
              );
              continue;
            }
            
            console.log(`📥 Attempting to download: ${filename}`);
            
            try {
              // Method 1: Try Chat API media.download endpoint
              if (attachment.driveFile && attachment.driveFile.name) {
                console.log('  → Using Chat API media.download...');
                
                const mediaResponse = await chat.media.download({
                  resourceName: attachment.driveFile.name
                });
                
                if (mediaResponse.data) {
                  fs.writeFileSync(filePath, mediaResponse.data);
                  console.log(`  ✅ Downloaded via Chat API: ${filename}`);
                  downloadCount++;
                  
                  // Update database with localPath
                  await db.collection('chats').updateOne(
                    {
                      '_id': chatDoc._id
                    },
                    {
                      $set: {
                        'messages.$[msg].attachments.$[att].localPath': `/media/${filename}`
                      }
                    },
                    {
                      arrayFilters: [
                        { 'msg._id': message._id },
                        { 'att._id': attachment._id }
                      ]
                    }
                  );
                  
                  continue;
                }
              }
              
              // Method 2: Try authenticated HTTP request to downloadUrl
              if (attachment.downloadUrl) {
                console.log('  → Using authenticated HTTP download...');
                
                const accessToken = await auth.getAccessToken();
                
                const downloaded = await downloadWithAuth(
                  attachment.downloadUrl, 
                  filePath, 
                  accessToken.token
                );
                
                if (downloaded) {
                  console.log(`  ✅ Downloaded via HTTP: ${filename}`);
                  downloadCount++;
                  
                  // Update database with localPath
                  await db.collection('chats').updateOne(
                    {
                      '_id': chatDoc._id
                    },
                    {
                      $set: {
                        'messages.$[msg].attachments.$[att].localPath': `/media/${filename}`
                      }
                    },
                    {
                      arrayFilters: [
                        { 'msg._id': message._id },
                        { 'att._id': attachment._id }
                      ]
                    }
                  );
                  
                  continue;
                }
              }
              
              // Method 3: Try to reconstruct Google Chat attachment URL
              console.log('  → Trying reconstructed Chat URL...');
              const spaceId = chatDoc.spaceId;
              const messageId = message.messageId;
              
              if (spaceId && messageId && attachment._id) {
                const chatAttachmentUrl = `https://chat.googleapis.com/v1/${spaceId}/messages/${messageId}/attachments/${attachment._id}`;
                
                const accessToken = await auth.getAccessToken();
                const downloaded = await downloadWithAuth(
                  chatAttachmentUrl, 
                  filePath, 
                  accessToken.token
                );
                
                if (downloaded) {
                  console.log(`  ✅ Downloaded via reconstructed URL: ${filename}`);
                  downloadCount++;
                  
                  // Update database with localPath
                  await db.collection('chats').updateOne(
                    {
                      '_id': chatDoc._id
                    },
                    {
                      $set: {
                        'messages.$[msg].attachments.$[att].localPath': `/media/${filename}`
                      }
                    },
                    {
                      arrayFilters: [
                        { 'msg._id': message._id },
                        { 'att._id': attachment._id }
                      ]
                    }
                  );
                  
                  continue;
                }
              }
              
              console.log(`  ❌ Failed to download: ${filename}`);
              failureCount++;
              
            } catch (error) {
              console.error(`  ❌ Error downloading ${filename}:`, error.message);
              failureCount++;
            }
          }
        }
      }
    }
    
    await client.close();
    
    console.log(`\n🎉 Download complete!`);
    console.log(`✅ Successfully downloaded: ${downloadCount} files`);
    console.log(`❌ Failed downloads: ${failureCount} files`);
    
  } catch (error) {
    console.error('❌ Error in chat media download:', error);
  }
};

// Helper function to download file with authentication
const downloadWithAuth = (url, filePath, accessToken) => {
  return new Promise((resolve) => {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'Gmail-Chat-Downloader/1.0'
    };
    
    const protocol = url.startsWith('https:') ? https : http;
    
    const request = protocol.get(url, { headers }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`    → Following redirect: ${response.statusCode}`);
        return downloadWithAuth(response.headers.location, filePath, accessToken)
          .then(resolve);
      }
      
      if (response.statusCode !== 200) {
        console.log(`    → HTTP ${response.statusCode}: ${response.statusMessage}`);
        return resolve(false);
      }
      
      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        
        // Check if file was actually downloaded (not empty/error page)
        const stats = fs.statSync(filePath);
        if (stats.size < 100) {
          // Probably an error page, delete it
          fs.unlinkSync(filePath);
          console.log(`    → Downloaded file too small (${stats.size} bytes), likely error`);
          return resolve(false);
        }
        
        console.log(`    → Downloaded ${stats.size} bytes`);
        resolve(true);
      });
      
      fileStream.on('error', (error) => {
        console.error(`    → File write error:`, error.message);
        resolve(false);
      });
      
    }).on('error', (error) => {
      console.error(`    → Request error:`, error.message);
      resolve(false);
    });
    
    // Set timeout
    request.setTimeout(30000, () => {
      request.destroy();
      console.log(`    → Request timeout`);
      resolve(false);
    });
  });
};

// Run the downloader
if (require.main === module) {
  downloadChatMedia();
}

module.exports = { downloadChatMedia };
