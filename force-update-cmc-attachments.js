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

async function forceUpdateCMCAttachments() {
  try {
    console.log('🌐 Connecting to CLOUD database...');
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Get CMC chat from cloud database
    const cmcChat = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (!cmcChat) {
      console.error('❌ CMC chat not found in cloud database');
      return;
    }

    console.log(`📄 Found CMC chat: ${cmcChat._id}`);
    console.log(`   Current messages: ${cmcChat.messageCount}`);
    console.log(`   Messages with attachments: ${cmcChat.messages.filter(m => m.attachments && m.attachments.length > 0).length}\n`);

    // Setup Google Chat API
    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });

    console.log('🔄 Fetching fresh message data from Google Chat API...');

    // Get fresh messages from API for the 3 media messages
    const mediaMessageIds = [
      'spaces/AAQAPUbCMD0/messages/2ZbIX6lc2xo.2ZbIX6lc2xo', // Image
      'spaces/AAQAPUbCMD0/messages/9zIiSqBD4_M.9zIiSqBD4_M', // Video  
      'spaces/AAQAPUbCMD0/messages/sOcNxtFyBqk.sOcNxtFyBqk'  // PDF
    ];

    const updatedMessages = [...cmcChat.messages];

    for (let i = 0; i < mediaMessageIds.length; i++) {
      const messageId = mediaMessageIds[i];
      console.log(`\\n📨 Processing ${messageId}...`);

      try {
        // Get full message from API
        const fullMessage = await chat.spaces.messages.get({ name: messageId });
        const messageData = fullMessage.data;

        console.log(`   Text: "${(messageData.text || '(no text)').substring(0, 30)}..."`);

        // Check for attachments
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

          // Find the corresponding message in the chat and update it
          const messageIndex = updatedMessages.findIndex(msg => msg.messageId === messageId);
          if (messageIndex !== -1) {
            updatedMessages[messageIndex].attachments = finalAttachments;
            updatedMessages[messageIndex].hasAttachments = true;
            updatedMessages[messageIndex].hasMedia = finalAttachments.some(att => att.isImage || att.isVideo);
            updatedMessages[messageIndex].hasDocuments = finalAttachments.some(att => att.isDocument);
            
            console.log(`   ✅ Updated message with ${finalAttachments.length} attachments`);
            finalAttachments.forEach((att, j) => {
              console.log(`      ${j+1}. ${att.name} (${att.contentType}) - ${att.downloadStatus}`);
            });
          } else {
            console.log(`   ⚠️ Message not found in chat messages array`);
          }
        } else {
          console.log(`   ➖ No attachments for this message`);
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${messageId}:`, error.message);
      }
    }

    // Save the updated chat
    console.log(`\\n💾 Saving updated CMC chat...`);
    cmcChat.messages = updatedMessages;
    cmcChat.updatedAt = new Date();
    
    await cmcChat.save();

    // Verify the update
    const verifyChat = await Chat.findById(cmcChat._id);
    const attachmentCounts = verifyChat.messages.map(m => m.attachments ? m.attachments.length : 0);
    const totalAttachments = attachmentCounts.reduce((a, b) => a + b, 0);

    console.log(`\\n🎉 Update completed!`);
    console.log(`   Chat ID: ${verifyChat._id}`);
    console.log(`   Attachments per message: [${attachmentCounts.join(', ')}]`);
    console.log(`   Total attachments: ${totalAttachments}`);

    if (totalAttachments === 3) {
      console.log(`\\n✅ SUCCESS! Your CMC chat now has all 3 attachments!`);
      console.log(`\\nRefresh your database browser and check chat ID: ${verifyChat._id.toString()}`);
    } else {
      console.log(`\\n⚠️ Expected 3 attachments but got ${totalAttachments}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

forceUpdateCMCAttachments();
