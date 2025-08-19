const { google } = require('googleapis');
const keys = require('./dispatch.json');

const SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

const userEmail = 'naveendev@crossmilescarrier.com';

async function debugSyncAttachmentDetection() {
  try {
    console.log('🔍 Debugging sync attachment detection logic...\n');

    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      userEmail
    );

    const chat = google.chat({ version: 'v1', auth });
    const cmcSpaceId = 'spaces/AAQAPUbCMD0';

    // Get messages exactly like the sync service does
    const messageRes = await chat.spaces.messages.list({
      parent: cmcSpaceId,
      pageSize: 100,
    });

    const rawMessages = messageRes.data.messages || [];
    console.log(`📨 Found ${rawMessages.length} raw messages in CMC space\n`);
    
    // Debug the sync logic step by step
    for (const m of rawMessages) {
      console.log(`\n🔍 Processing message: ${m.name}`);
      console.log(`Text: "${(m.text || '(no text)').substring(0, 50)}..."`);
      
      // Step 1: Check what the basic message list call returns
      console.log('\n📋 Basic message list data:');
      console.log(`  - m.attachments: ${m.attachments ? `Array(${m.attachments.length})` : 'undefined'}`);
      console.log(`  - m.attachment: ${m.attachment ? (Array.isArray(m.attachment) ? `Array(${m.attachment.length})` : 'Object') : 'undefined'}`);
      
      // Step 2: Get full message details (like sync service does)
      console.log('\n📋 Getting full message details...');
      let fullMessage;
      let fullMessageData;
      try {
        fullMessage = await chat.spaces.messages.get({
          name: m.name
        });
        fullMessageData = fullMessage.data;
        console.log(`  ✅ Full message retrieved successfully`);
      } catch (error) {
        console.log(`  ❌ Failed to get full message: ${error.message}`);
        fullMessageData = m;
      }
      
      console.log('\n📋 Full message data:');
      console.log(`  - fullMessageData.attachments: ${fullMessageData.attachments ? `Array(${fullMessageData.attachments.length})` : 'undefined'}`);
      console.log(`  - fullMessageData.attachment: ${fullMessageData.attachment ? (Array.isArray(fullMessageData.attachment) ? `Array(${fullMessageData.attachment.length})` : 'Object') : 'undefined'}`);
      
      // Step 3: Apply sync service logic
      let attachments = [];
      
      // Handle both singular and plural attachment fields (sync service logic)
      if (fullMessageData.attachments && Array.isArray(fullMessageData.attachments)) {
        attachments = fullMessageData.attachments;
        console.log(`  📎 Using fullMessageData.attachments: ${attachments.length} attachments`);
      } else if (fullMessageData.attachment) {
        if (Array.isArray(fullMessageData.attachment)) {
          attachments = fullMessageData.attachment;
          console.log(`  📎 Using fullMessageData.attachment as array: ${attachments.length} attachments`);
        } else {
          attachments = [fullMessageData.attachment];
          console.log(`  📎 Using fullMessageData.attachment as single object: 1 attachment`);
        }
      }
      
      console.log(`\n📊 Final attachment count: ${attachments.length}`);
      
      if (attachments.length > 0) {
        console.log('📎 Attachment details:');
        attachments.forEach((att, index) => {
          console.log(`  ${index + 1}. ${att.contentName || 'Unknown'} (${att.contentType || 'Unknown type'})`);
          console.log(`     - name: ${att.name || 'undefined'}`);
          console.log(`     - contentName: ${att.contentName || 'undefined'}`);
          console.log(`     - downloadUri: ${att.downloadUri ? 'present' : 'undefined'}`);
        });
      } else {
        console.log('❌ No attachments detected by sync logic');
      }
      
      console.log('═'.repeat(80));
    }

  } catch (error) {
    console.error('❌ Error debugging sync attachment detection:', error.message);
  }
}

debugSyncAttachmentDetection();
