const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Load credentials
const keys = require('./dispatch.json');
const userEmail = 'naveendev@crossmilescarrier.com';

const downloadGmailMedia = async () => {
  try {
    console.log('🚀 Starting Gmail API media download...');
    
    // Set up Gmail API authentication
    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
      ],
      userEmail
    );

    const gmail = google.gmail({ version: 'v1', auth });
    
    // Connect to database
    const client = new MongoClient('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net');
    await client.connect();
    const db = client.db('emails');
    
    // Get all chats with missing attachments
    const allChats = await db.collection('chats').find().toArray();
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
    
    // Collect all missing files
    const missingFiles = [];
    for (const chat of chats) {
      for (const message of chat.messages) {
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            const filename = attachment.filename || attachment.contentName;
            const filePath = path.join(mediaDirectory, filename);
            
            if (!attachment.localPath && filename && !fs.existsSync(filePath)) {
              missingFiles.push({
                filename,
                attachment,
                chat,
                message,
                filePath
              });
            }
          }
        }
      }
    }
    
    console.log(`📋 Found ${missingFiles.length} missing files to download`);
    
    // Try to find these files in Gmail
    for (const item of missingFiles) {
      console.log(`\n🔍 Searching Gmail for: ${item.filename}`);
      
      let searchResponse = null;
      const searchStrategies = [
        // Strategy 1: Exact filename match
        `has:attachment filename:"${item.filename}"`,
        // Strategy 2: Filename without extension
        `has:attachment filename:"${item.filename.split('.')[0]}"`,
        // Strategy 3: Just the base name (remove dates/numbers)
        `has:attachment filename:"${item.filename.replace(/[0-9_\-]/g, ' ').trim()}"`,
        // Strategy 4: Search by file extension
        `has:attachment filename:${item.filename.split('.').pop()}`,
        // Strategy 5: Broader search for any part of filename
        `has:attachment ${item.filename.split('.')[0].split('_')[0]}`,
        // Strategy 6: Search in chat messages specifically
        `has:attachment label:chats`,
        // Strategy 7: Recent messages with attachments
        `has:attachment newer_than:30d`
      ];
      
      let found = false;
      
      for (let i = 0; i < searchStrategies.length && !found; i++) {
        const searchQuery = searchStrategies[i];
        console.log(`  Strategy ${i + 1}: ${searchQuery}`);
        
        try {
          searchResponse = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery,
            maxResults: 20
          });
          
          if (searchResponse.data.messages && searchResponse.data.messages.length > 0) {
            console.log(`  📧 Found ${searchResponse.data.messages.length} Gmail messages`);
            found = true;
            break;
          } else {
            console.log(`    ❌ No results`);
          }
        } catch (error) {
          console.log(`    ⚠️ Search error: ${error.message}`);
        }
      }
      
      if (!found || !searchResponse.data.messages) {
        console.log(`  ❌ No Gmail messages found with any search strategy for ${item.filename}`);
        failureCount++;
        continue;
      }
      
      try {
        console.log(`  📧 Found ${searchResponse.data.messages.length} Gmail messages`);
        
        // Try each message until we find the attachment
        let downloaded = false;
        for (const msgRef of searchResponse.data.messages) {
          try {
            const message = await gmail.users.messages.get({
              userId: 'me',
              id: msgRef.id,
              format: 'full'
            });
            
            // Look for attachments in the message
            const attachments = extractAttachments(message.data.payload);
            
            // Try exact match first, then partial match
            let targetAttachment = attachments.find(att => 
              att.filename === item.filename
            );
            
            // If no exact match, try partial filename match
            if (!targetAttachment) {
              const baseName = item.filename.split('.')[0];
              targetAttachment = attachments.find(att => 
                att.filename.includes(baseName) || baseName.includes(att.filename.split('.')[0])
              );
              if (targetAttachment) {
                console.log(`    🔍 Found similar attachment: ${targetAttachment.filename} (looking for ${item.filename})`);
              }
            }
            
            if (targetAttachment && targetAttachment.body.attachmentId) {
              console.log(`  📎 Found attachment in Gmail message ${msgRef.id}`);
              
              // Download the attachment
              const attachmentData = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: msgRef.id,
                id: targetAttachment.body.attachmentId
              });
              
              if (attachmentData.data.data) {
                const buffer = Buffer.from(attachmentData.data.data, 'base64');
                
                // Use the original filename for saving
                fs.writeFileSync(item.filePath, buffer);
                
                const fileSize = buffer.length;
                console.log(`  ✅ Downloaded ${item.filename} (${Math.round(fileSize/1024)}KB)`);
                
                // Update database with localPath
                await db.collection('chats').updateOne(
                  { '_id': item.chat._id },
                  {
                    $set: {
                      'messages.$[msg].attachments.$[att].localPath': `/media/${item.filename}`
                    }
                  },
                  {
                    arrayFilters: [
                      { 'msg._id': item.message._id },
                      { 'att._id': item.attachment._id }
                    ]
                  }
                );
                
                downloadCount++;
                downloaded = true;
                break;
              }
            } else {
              // Show what attachments were found for debugging
              if (attachments.length > 0) {
                console.log(`    📎 Available attachments in message: ${attachments.map(a => a.filename).join(', ')}`);
              }
            }
          } catch (error) {
            console.log(`    ⚠️ Error checking message ${msgRef.id}: ${error.message}`);
          }
        }
        
        if (!downloaded) {
          console.log(`  ❌ Could not download ${item.filename} from Gmail`);
          failureCount++;
        }
        
      } catch (error) {
        console.error(`  ❌ Error searching Gmail for ${item.filename}:`, error.message);
        failureCount++;
      }
    }
    
    await client.close();
    
    console.log(`\n🎉 Gmail download complete!`);
    console.log(`✅ Successfully downloaded: ${downloadCount} files`);
    console.log(`❌ Failed downloads: ${failureCount} files`);
    
  } catch (error) {
    console.error('❌ Error in Gmail media download:', error);
  }
};

// Helper function to extract attachments from Gmail message payload
function extractAttachments(payload, attachments = []) {
  if (!payload) return attachments;

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          body: part.body,
        });
      }
      if (part.parts) {
        extractAttachments(part, attachments);
      }
    }
  }

  return attachments;
}

// Run the downloader
if (require.main === module) {
  downloadGmailMedia();
}

module.exports = { downloadGmailMedia };
