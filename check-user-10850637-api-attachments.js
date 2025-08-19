const { google } = require('googleapis');
const keys = require('./dispatch.json');

const SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

const userEmail = 'naveendev@crossmilescarrier.com';

// The two spaces that might be missing attachments
const spacesToCheck = [
  { spaceId: 'spaces/zJfRaCAAAAE', name: 'Direct Message 1' },
  { spaceId: 'spaces/oSpG6CAAAAE', name: 'Direct Message 2' }
];

async function checkUser10850637APIAttachments() {
  try {
    console.log('🔍 Checking Google Chat API for User 10850637 attachments...\n');

    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });

    for (const space of spacesToCheck) {
      console.log(`📋 Checking ${space.name} (${space.spaceId})...`);

      try {
        // Fetch messages from this space
        const messagesResponse = await chat.spaces.messages.list({
          parent: space.spaceId,
          pageSize: 50,
          orderBy: 'create_time desc'
        });

        const messages = messagesResponse.data.messages || [];
        console.log(`   Found ${messages.length} messages in ${space.name}\n`);

        let totalAttachments = 0;
        let messagesFromUser10850637 = 0;
        let attachmentsFromUser10850637 = 0;

        for (const message of messages) {
          const messageId = message.name.split('/').pop();
          const text = (message.text || '(no text)').substring(0, 40);
          const senderName = message.sender?.displayName || 'Unknown';
          
          // Check if message is from User 10850637
          const isFromUser10850637 = message.sender?.name?.includes('10850637') || 
                                      senderName.includes('10850637');
          
          if (isFromUser10850637) {
            messagesFromUser10850637++;
          }

          // Check for attachments
          let attachments = [];
          if (message.attachment) {
            attachments = Array.isArray(message.attachment) ? message.attachment : [message.attachment];
          }

          if (attachments.length > 0) {
            totalAttachments += attachments.length;
            
            if (isFromUser10850637) {
              attachmentsFromUser10850637 += attachments.length;
            }

            console.log(`   📎 ${messageId} - "${text}..." - Sender: ${senderName}`);
            console.log(`      ${attachments.length} attachments:`);
            attachments.forEach((att, i) => {
              console.log(`        ${i + 1}. ${att.contentName || 'Unknown'} (${att.contentType || 'Unknown type'})`);
            });
            
            if (isFromUser10850637) {
              console.log(`      🎯 FROM USER 10850637`);
            }
            console.log('');
          }
        }

        console.log(`   📊 Summary for ${space.name}:`);
        console.log(`      Total messages: ${messages.length}`);
        console.log(`      Messages from User 10850637: ${messagesFromUser10850637}`);
        console.log(`      Total attachments in space: ${totalAttachments}`);
        console.log(`      Attachments from User 10850637: ${attachmentsFromUser10850637}`);

        if (attachmentsFromUser10850637 > 0) {
          console.log(`      ⚠️  User 10850637 HAS ${attachmentsFromUser10850637} attachments that are missing from database!`);
        } else if (totalAttachments > 0) {
          console.log(`      ℹ️  User 10850637 has no attachments, but other users have ${totalAttachments} attachments`);
        } else {
          console.log(`      ✅ No attachments in this space`);
        }

        console.log('\n' + '='.repeat(80) + '\n');

      } catch (error) {
        console.error(`   ❌ Error fetching messages from ${space.name}:`, error.message);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    }

  } catch (error) {
    console.error('❌ Error checking API attachments:', error.message);
  }
}

checkUser10850637APIAttachments();
