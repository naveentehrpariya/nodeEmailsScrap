const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

const SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

const userEmail = 'naveendev@crossmilescarrier.com';

// Messages from User 10850637 that have missing attachments
const missingAttachmentMessages = [
  {
    spaceId: 'spaces/zJfRaCAAAAE',
    spaceName: 'Direct Message 1',
    messageId: 'spaces/zJfRaCAAAAE/messages/Cv9sJ4zrWUo.Cv9sJ4zrWUo',
    shortId: 'Cv9sJ4zrWUo',
    expectedAttachment: 'Image_20250812_221313_040.png'
  },
  {
    spaceId: 'spaces/zJfRaCAAAAE', 
    spaceName: 'Direct Message 1',
    messageId: 'spaces/zJfRaCAAAAE/messages/1f-vV1ogLPs.1f-vV1ogLPs',
    shortId: '1f-vV1ogLPs',
    expectedAttachment: 'Screenshot 2025-07-24 at 10.08.17 PM.png'
  },
  {
    spaceId: 'spaces/oSpG6CAAAAE',
    spaceName: 'Direct Message 2', 
    messageId: 'spaces/oSpG6CAAAAE/messages/blNkio3ef1w.blNkio3ef1w',
    shortId: 'blNkio3ef1w',
    expectedAttachment: 'DEVRAJ_16PROMAX (1).pdf'
  }
];

async function fixUser10850637Attachments() {
  try {
    console.log('🌐 Connecting to CLOUD database...');
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Setup Google Chat API
    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });

    console.log('🔄 Fixing missing attachments for User 10850637...\n');

    let totalFixed = 0;

    for (const msgInfo of missingAttachmentMessages) {
      console.log(`📨 Processing ${msgInfo.spaceName} - ${msgInfo.shortId}...`);
      console.log(`   Expected attachment: ${msgInfo.expectedAttachment}`);

      try {
        // Get the chat document from database
        const chatDoc = await Chat.findOne({ spaceId: msgInfo.spaceId });
        if (!chatDoc) {
          console.log(`   ❌ Chat not found for ${msgInfo.spaceId}`);
          continue;
        }

        // Get full message from API
        const fullMessage = await chat.spaces.messages.get({ name: msgInfo.messageId });
        const messageData = fullMessage.data;

        console.log(`   Text: "${(messageData.text || '(no text)').substring(0, 40)}..."`);

        // Check for attachments in API
        let attachments = [];
        if (messageData.attachment && Array.isArray(messageData.attachment)) {
          attachments = messageData.attachment;
        } else if (messageData.attachment) {
          attachments = [messageData.attachment];
        }

        console.log(`   Found ${attachments.length} attachments in API`);

        if (attachments.length > 0) {
          // Process attachments
          console.log(`   📎 Processing attachments...`);
          const processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(
            { ...messageData, attachments }, 
            auth
          );

          // Ensure proper attachment names
          const finalAttachments = processedAttachments.map(att => {
            if (!att.name && att.contentName) {
              att.name = att.contentName;
            } else if (!att.name && att.localPath) {
              const fileName = att.localPath.split('/').pop().replace(/^\\d+_/, '');
              att.name = fileName;
            } else if (!att.name) {
              att.name = 'Unnamed attachment';
            }
            return att;
          });

          // Find and update the corresponding message in the chat
          const messageIndex = chatDoc.messages.findIndex(msg => msg.messageId === msgInfo.messageId);
          if (messageIndex !== -1) {
            chatDoc.messages[messageIndex].attachments = finalAttachments;
            chatDoc.messages[messageIndex].hasAttachments = true;
            chatDoc.messages[messageIndex].hasMedia = finalAttachments.some(att => att.isImage || att.isVideo);
            chatDoc.messages[messageIndex].hasDocuments = finalAttachments.some(att => att.isDocument);
            
            console.log(`   ✅ Updated message with ${finalAttachments.length} attachments`);
            finalAttachments.forEach((att, j) => {
              console.log(`      ${j+1}. ${att.name || att.contentName} (${att.contentType}) - ${att.downloadStatus}`);
            });

            totalFixed++;
          } else {
            console.log(`   ⚠️ Message ${msgInfo.shortId} not found in chat messages array`);
          }

          // Save the updated chat
          chatDoc.updatedAt = new Date();
          await chatDoc.save();
          console.log(`   💾 Saved updated chat`);

        } else {
          console.log(`   ⚠️ No attachments found in API for this message`);
        }

        console.log('');

      } catch (error) {
        console.error(`   ❌ Error processing ${msgInfo.shortId}:`, error.message);
        console.log('');
      }
    }

    // Verify the fixes
    console.log(`🎉 Attachment fix completed!\n`);
    console.log(`📊 Summary:`);
    console.log(`   Messages processed: ${missingAttachmentMessages.length}`);
    console.log(`   Messages fixed: ${totalFixed}`);

    if (totalFixed > 0) {
      console.log(`\n✅ SUCCESS! Fixed ${totalFixed} messages with missing attachments for User 10850637`);
      console.log(`\n🔍 Verification - checking updated chats:`);

      // Verify each space
      for (const space of ['spaces/zJfRaCAAAAE', 'spaces/oSpG6CAAAAE']) {
        const updatedChat = await Chat.findOne({ spaceId: space });
        if (updatedChat) {
          const user10850637MessagesWithAttachments = updatedChat.messages.filter(msg => 
            (msg.senderId.includes('10850637') || msg.senderDisplayName.includes('User 10850637')) &&
            msg.attachments && msg.attachments.length > 0
          ).length;
          
          console.log(`   ${space}: ${user10850637MessagesWithAttachments} messages from User 10850637 now have attachments`);
        }
      }

      console.log(`\n🎯 Next steps:`);
      console.log(`   1. Refresh your database browser`);
      console.log(`   2. Check the direct message chats for User 10850637`);
      console.log(`   3. Verify attachments are now visible in your frontend`);

    } else {
      console.log(`\n⚠️ No messages were fixed. Please check the logs above for errors.`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixUser10850637Attachments();
