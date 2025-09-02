const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load credentials
const keys = require('./dispatch.json');
const userEmail = 'naveendev@crossmilescarrier.com';

const downloadAvailableGmail = async () => {
  try {
    console.log('🚀 Downloading available Gmail attachments...');
    
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
    
    const mediaDirectory = path.join(__dirname, 'media');
    if (!fs.existsSync(mediaDirectory)) {
      fs.mkdirSync(mediaDirectory, { recursive: true });
    }
    
    // Search for recent messages with attachments
    const searchResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment newer_than:30d',
      maxResults: 10
    });
    
    if (!searchResponse.data.messages) {
      console.log('No messages found');
      return;
    }
    
    console.log(`📧 Found ${searchResponse.data.messages.length} messages with attachments`);
    
    let downloadCount = 0;
    
    for (const msgRef of searchResponse.data.messages) {
      try {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: msgRef.id,
          format: 'full'
        });
        
        // Look for attachments in the message
        const attachments = extractAttachments(message.data.payload);
        
        if (attachments.length > 0) {
          console.log(`\n📎 Message ${msgRef.id} has ${attachments.length} attachments:`);
          attachments.forEach((att, i) => {
            console.log(`  ${i + 1}. ${att.filename} (${att.mimeType})`);
          });
          
          // Download image and video files that might be similar to our missing files
          for (const att of attachments) {
            const isMedia = att.mimeType.startsWith('image/') || 
                           att.mimeType.startsWith('video/') ||
                           att.filename.toLowerCase().includes('screenshot') ||
                           att.filename.toLowerCase().includes('image') ||
                           att.filename.toLowerCase().includes('video');
            
            if (isMedia && att.body.attachmentId) {
              const filePath = path.join(mediaDirectory, att.filename);
              
              // Skip if already exists
              if (fs.existsSync(filePath)) {
                console.log(`    ✅ Already exists: ${att.filename}`);
                continue;
              }
              
              try {
                console.log(`    📥 Downloading: ${att.filename}`);
                
                const attachmentData = await gmail.users.messages.attachments.get({
                  userId: 'me',
                  messageId: msgRef.id,
                  id: att.body.attachmentId
                });
                
                if (attachmentData.data.data) {
                  const buffer = Buffer.from(attachmentData.data.data, 'base64');
                  fs.writeFileSync(filePath, buffer);
                  
                  const fileSize = buffer.length;
                  console.log(`    ✅ Downloaded ${att.filename} (${Math.round(fileSize/1024)}KB)`);
                  downloadCount++;
                }
              } catch (error) {
                console.log(`    ❌ Error downloading ${att.filename}: ${error.message}`);
              }
            }
          }
        }
        
      } catch (error) {
        console.log(`⚠️ Error checking message ${msgRef.id}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Downloaded ${downloadCount} additional media files from Gmail`);
    
  } catch (error) {
    console.error('❌ Error:', error);
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

downloadAvailableGmail();
