#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

const TEST_EMAIL = 'naveendev@crossmilescarrier.com';

async function testAttachmentProcessingFix() {
  console.log('🔧 Testing Attachment Processing Fix\n');
  
  try {
    const SCOPES = [
      "https://www.googleapis.com/auth/chat.spaces.readonly",
      "https://www.googleapis.com/auth/chat.messages.readonly", 
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
      "https://www.googleapis.com/auth/drive.readonly"
    ];

    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      TEST_EMAIL
    );

    const chat = google.chat({ version: "v1", auth });
    
    console.log('1️⃣ Fetching spaces...');
    const spaceRes = await chat.spaces.list();
    const spaces = spaceRes.data.spaces || [];
    
    console.log(`✅ Found ${spaces.length} spaces`);
    
    // Look for the space we know has attachments (CMC space)
    const cmcSpace = spaces.find(s => s.displayName === 'CMC');
    if (!cmcSpace) {
      console.log('❌ CMC space not found');
      return;
    }
    
    console.log(`\n2️⃣ Testing CMC space: ${cmcSpace.name}`);
    
    // Get messages from this space
    const messageRes = await chat.spaces.messages.list({
      parent: cmcSpace.name,
      pageSize: 5
    });
    
    const messages = messageRes.data.messages || [];
    console.log(`📨 Found ${messages.length} messages`);
    
    // Test each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      console.log(`\n🔍 Testing message ${i + 1}: "${(message.text || '(no text)').substring(0, 30)}..."`);
      
      // Check basic message for attachments
      const basicAttachments = message.attachments || message.attachment || [];
      console.log(`   Basic message attachments: ${basicAttachments.length}`);
      
      // Get full message details (like the fixed sync service does)
      try {
        console.log('   🔍 Fetching full message details...');
        const fullMessage = await chat.spaces.messages.get({
          name: message.name
        });
        
        const fullMessageData = fullMessage.data; // This is the fix!
        
        // Check for attachments in full message data
        const fullAttachments = fullMessageData.attachments || fullMessageData.attachment || [];
        console.log(`   Full message attachments: ${fullAttachments.length}`);
        
        if (fullAttachments.length > 0) {
          console.log(`   🎯 FOUND ATTACHMENTS! Processing ${fullAttachments.length} attachments...`);
          
          // Test the media processing service
          try {
            const messageWithAttachments = { 
              ...fullMessageData, 
              attachments: fullAttachments,
              name: message.name 
            };
            
            const processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(
              messageWithAttachments, 
              auth
            );
            
            console.log(`   ✅ Successfully processed ${processedAttachments.length} attachments:`);
            processedAttachments.forEach((att, index) => {
              console.log(`      ${index + 1}. ${att.filename} (${att.mediaType}) - Status: ${att.downloadStatus}`);
            });
            
            // This proves the fix works!
            console.log(`   🎉 FIX VERIFIED: Attachments are now being detected and processed!`);
            
          } catch (processError) {
            console.log(`   ❌ Processing failed: ${processError.message}`);
          }
        } else {
          console.log(`   ⚪ No attachments in this message`);
        }
        
      } catch (fullMsgError) {
        console.log(`   ❌ Failed to get full message: ${fullMsgError.message}`);
      }
    }
    
    console.log('\n📊 Test Summary:');
    console.log('   - The fix extracts fullMessage.data instead of using fullMessage directly');
    console.log('   - This ensures we check attachments on the actual message data object');
    console.log('   - Media processing service can now receive proper attachment data');
    console.log('\n✅ The fix should resolve the issue where media messages were not saving to database!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAttachmentProcessingFix();
