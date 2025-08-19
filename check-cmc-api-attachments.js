const { google } = require('googleapis');
const keys = require('./dispatch.json');

const SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

const userEmail = 'naveendev@crossmilescarrier.com';

async function checkCMCAttachments() {
  try {
    console.log('🔍 Checking CMC space for attachments via Google Chat API...\n');

    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });
    const cmcSpaceId = 'spaces/AAQAPUbCMD0';

    console.log(`Fetching messages from ${cmcSpaceId}...\n`);

    // Fetch messages from CMC space
    const messagesResponse = await chat.spaces.messages.list({
      parent: cmcSpaceId,
      pageSize: 20,
      orderBy: 'create_time desc'
    });

    const messages = messagesResponse.data.messages || [];
    console.log(`Found ${messages.length} messages in CMC space\n`);

    let messageIndex = 0;
    let totalAttachments = 0;

    for (const message of messages) {
      messageIndex++;
      console.log(`Message ${messageIndex}:`);
      console.log(`  ID: ${message.name}`);
      console.log(`  Text: ${(message.text || '(no text)').substring(0, 50)}...`);
      console.log(`  Create Time: ${message.createTime}`);
      console.log(`  Sender: ${message.sender?.displayName || 'Unknown'}`);
      
      // Check for attachments in the message
      if (message.attachment) {
        console.log(`  Has 'attachment' field (singular):`, !!message.attachment);
        console.log(`  Attachment details:`, JSON.stringify(message.attachment, null, 4));
        totalAttachments++;
      }
      
      if (message.attachments) {
        console.log(`  Has 'attachments' field (plural):`, message.attachments.length);
        if (message.attachments.length > 0) {
          console.log(`  Attachments details:`, JSON.stringify(message.attachments, null, 4));
          totalAttachments += message.attachments.length;
        }
      }
      
      // Check if the message has no attachment fields at all
      if (!message.attachment && (!message.attachments || message.attachments.length === 0)) {
        console.log(`  ❌ No attachments found`);
      }
      
      console.log('');
    }

    console.log(`\n📊 Summary:`);
    console.log(`Total messages checked: ${messages.length}`);
    console.log(`Total attachments found: ${totalAttachments}`);
    
    if (totalAttachments === 0) {
      console.log('\n❌ No attachments found in CMC space via Google Chat API');
      console.log('This could mean:');
      console.log('  1. There are no media messages in this space');
      console.log('  2. Attachments are not being returned by the API');
      console.log('  3. Different API scopes or permissions are needed');
    } else {
      console.log(`\n✅ Found ${totalAttachments} attachments in CMC space`);
    }

  } catch (error) {
    console.error('❌ Error checking CMC attachments:', error.message);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
  }
}

checkCMCAttachments();
