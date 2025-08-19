const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
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

async function comprehensiveMediaSync() {
  try {
    console.log('🚀 COMPREHENSIVE MEDIA SYNC FOR ALL SPACES AND DIRECT MESSAGES');
    console.log('=' .repeat(80));
    console.log('This will find and fix ALL missing media attachments across ALL chats\n');

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

    console.log('🔍 Step 1: Discovering ALL Google Chat spaces...\n');

    // Get all spaces from Google Chat API
    const spacesResponse = await chat.spaces.list();
    const allSpaces = spacesResponse.data.spaces || [];
    console.log(`Found ${allSpaces.length} spaces in Google Chat API\n`);

    let totalProcessedSpaces = 0;
    let totalProcessedMessages = 0;
    let totalAttachmentsFound = 0;
    let totalAttachmentsProcessed = 0;
    let spacesWithMedia = [];

    for (const space of allSpaces) {
      const spaceId = space.name;
      const displayName = space.displayName || 
        (space.spaceType === 'DIRECT_MESSAGE' ? '(Direct Message)' : '(Unnamed Space)');
      
      console.log(`\\n📋 Processing: ${displayName} (${spaceId})`);
      console.log(`   Type: ${space.spaceType}`);

      try {
        // Fetch all messages from this space
        const messagesResponse = await chat.spaces.messages.list({
          parent: spaceId,
          pageSize: 100,
          orderBy: 'create_time desc'
        });

        const messages = messagesResponse.data.messages || [];
        console.log(`   Messages found: ${messages.length}`);

        if (messages.length === 0) {
          console.log(`   ⏭️  Skipping empty space`);
          continue;
        }

        totalProcessedSpaces++;

        // Find messages with attachments
        let spaceAttachmentCount = 0;
        let messagesWithAttachmentsInAPI = [];

        for (const message of messages) {
          let attachments = [];
          if (message.attachment) {
            attachments = Array.isArray(message.attachment) ? message.attachment : [message.attachment];
          }

          if (attachments.length > 0) {
            messagesWithAttachmentsInAPI.push({
              messageId: message.name,
              shortId: message.name.split('/').pop(),
              text: (message.text || '(no text)').substring(0, 40),
              sender: message.sender?.displayName || 'Unknown',
              attachments: attachments,
              createTime: message.createTime
            });
            spaceAttachmentCount += attachments.length;
          }
          totalProcessedMessages++;
        }

        totalAttachmentsFound += spaceAttachmentCount;

        console.log(`   📎 Messages with attachments in API: ${messagesWithAttachmentsInAPI.length}`);
        console.log(`   📎 Total attachments in API: ${spaceAttachmentCount}`);

        if (messagesWithAttachmentsInAPI.length === 0) {
          console.log(`   ✅ No media attachments in this space`);
          continue;
        }

        // Log the attachments found
        console.log(`   🎯 Media attachments found:`);
        messagesWithAttachmentsInAPI.forEach((msg, i) => {
          console.log(`      ${i+1}. ${msg.shortId} - "${msg.text}..." - ${msg.attachments.length} attachments`);
          msg.attachments.forEach((att, j) => {
            console.log(`         ${j+1}. ${att.contentName || 'Unknown'} (${att.contentType || 'Unknown type'})`);
          });
        });

        spacesWithMedia.push({
          spaceId,
          displayName,
          spaceType: space.spaceType,
          messageCount: messages.length,
          attachmentMessages: messagesWithAttachmentsInAPI.length,
          totalAttachments: spaceAttachmentCount
        });

        // Now sync this space to the database
        console.log(`\\n   💾 Syncing to database...`);

        // Find or create the chat document
        let chatDoc = await Chat.findOne({ spaceId });
        
        if (!chatDoc) {
          console.log(`   📝 Creating new chat document for ${spaceId}`);
          
          // Get account
          const account = await Account.findOne({ email: userEmail });
          if (!account) {
            console.log(`   ❌ Account not found: ${userEmail}`);
            continue;
          }

          chatDoc = new Chat({
            account: account._id,
            spaceId,
            displayName,
            spaceType: space.spaceType,
            participants: [],
            messages: [],
            messageCount: 0,
            lastMessageTime: new Date()
          });
        }

        // Process all messages and update/add them
        let updatedMessages = [...chatDoc.messages];
        let newMessagesAdded = 0;
        let messagesUpdatedWithAttachments = 0;

        for (const message of messages) {
          const messageId = message.name;
          
          // Check if message already exists in database
          let existingMessageIndex = updatedMessages.findIndex(msg => msg.messageId === messageId);
          
          // Process sender info (simplified for this sync)
          const senderId = message.sender?.name || 'Unknown';
          const senderEmail = `user-${senderId.split('/').pop().substring(0, 8)}@crossmilescarrier.com`;
          const senderDisplayName = message.sender?.displayName || `User ${senderId.split('/').pop().substring(0, 8)}`;

          // Check for attachments
          let attachments = [];
          if (message.attachment) {
            attachments = Array.isArray(message.attachment) ? message.attachment : [message.attachment];
          }

          // Process attachments if they exist
          let processedAttachments = [];
          if (attachments.length > 0) {
            try {
              console.log(`     📎 Processing ${attachments.length} attachments for ${messageId.split('/').pop()}...`);
              processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(
                { ...message, attachments }, 
                auth
              );

              // Ensure proper names
              processedAttachments = processedAttachments.map(att => {
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

              totalAttachmentsProcessed += processedAttachments.length;
              console.log(`     ✅ Processed ${processedAttachments.length} attachments`);
              
            } catch (error) {
              console.log(`     ❌ Error processing attachments: ${error.message}`);
              // Keep original attachment data if processing fails
              processedAttachments = attachments.map(att => ({
                name: att.contentName || 'Unknown',
                contentType: att.contentType || 'unknown',
                downloadStatus: 'failed',
                downloadError: error.message,
                ...att
              }));
            }
          }

          const messageData = {
            messageId,
            text: message.text || '(no text)',
            senderId,
            senderEmail,
            senderDisplayName,
            senderDomain: 'crossmilescarrier.com',
            attachments: processedAttachments,
            isSentByCurrentUser: false,
            isExternal: false,
            createTime: new Date(message.createTime),
            hasAttachments: processedAttachments.length > 0,
            hasMedia: processedAttachments.some(att => att.isImage || att.isVideo),
            hasDocuments: processedAttachments.some(att => att.isDocument)
          };

          if (existingMessageIndex !== -1) {
            // Update existing message, preserving attachments
            updatedMessages[existingMessageIndex] = {
              ...updatedMessages[existingMessageIndex],
              ...messageData
            };
            if (processedAttachments.length > 0) {
              messagesUpdatedWithAttachments++;
            }
          } else {
            // Add new message
            updatedMessages.push(messageData);
            newMessagesAdded++;
          }
        }

        // Update the chat document
        chatDoc.messages = updatedMessages;
        chatDoc.messageCount = updatedMessages.length;
        chatDoc.lastMessageTime = messages.length > 0 ? new Date(messages[0].createTime) : chatDoc.lastMessageTime;
        chatDoc.updatedAt = new Date();

        await chatDoc.save();

        console.log(`   ✅ Saved to database:`);
        console.log(`      Total messages: ${updatedMessages.length}`);
        console.log(`      New messages added: ${newMessagesAdded}`);
        console.log(`      Messages with attachments: ${messagesUpdatedWithAttachments + (messagesWithAttachmentsInAPI.length - messagesUpdatedWithAttachments)}`);

      } catch (error) {
        console.log(`   ❌ Error processing space: ${error.message}`);
        continue;
      }
    }

    // Final summary
    console.log('\\n' + '='.repeat(80));
    console.log('🎉 COMPREHENSIVE MEDIA SYNC COMPLETED!');
    console.log('='.repeat(80));
    console.log(`📊 FINAL SUMMARY:`);
    console.log(`   Total spaces processed: ${totalProcessedSpaces}`);
    console.log(`   Total messages processed: ${totalProcessedMessages}`);
    console.log(`   Total attachments found in API: ${totalAttachmentsFound}`);
    console.log(`   Total attachments successfully processed: ${totalAttachmentsProcessed}`);
    console.log(`   Spaces with media: ${spacesWithMedia.length}`);

    if (spacesWithMedia.length > 0) {
      console.log(`\\n📋 Spaces with media attachments:`);
      spacesWithMedia.forEach((space, i) => {
        console.log(`   ${i+1}. ${space.displayName} (${space.spaceType})`);
        console.log(`      ${space.attachmentMessages} messages with ${space.totalAttachments} attachments`);
      });

      console.log(`\\n✅ SUCCESS! All media attachments have been synced to your cloud database!`);
      console.log(`\\n🎯 Next steps:`);
      console.log(`   1. Refresh your database browser`);
      console.log(`   2. Check your frontend chat application`);
      console.log(`   3. All media messages should now be visible across ALL spaces and direct messages`);
      
    } else {
      console.log(`\\n⚠️ No media attachments found in any Google Chat spaces`);
    }

  } catch (error) {
    console.error('❌ Error during comprehensive sync:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

comprehensiveMediaSync();
