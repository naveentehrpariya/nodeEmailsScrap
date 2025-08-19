#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

// Test email - replace with an actual email that has Google Chat access
const TEST_EMAIL = 'naveendev@crossmilescarrier.com'; 

async function testChatAPIAttachments() {
  console.log('🧪 Testing Google Chat API for Attachment Detection\n');
  
  try {
    // Setup Google Chat API with all required scopes
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
    
    console.log(`🔑 Testing with email: ${TEST_EMAIL}`);
    console.log(`📋 Using scopes: ${SCOPES.join(', ')}\n`);
    
    // Test 1: List spaces
    console.log('1️⃣ Fetching Google Chat spaces...');
    const spaceRes = await chat.spaces.list();
    const spaces = spaceRes.data.spaces || [];
    console.log(`✅ Found ${spaces.length} spaces\n`);
    
    if (spaces.length === 0) {
      console.log('❌ No spaces found. This could mean:');
      console.log('1. The email has no Google Chat conversations');
      console.log('2. The service account lacks proper permissions');
      console.log('3. Google Chat API is not enabled');
      return;
    }
    
    // Test 2: Check first few spaces for messages
    let totalMessages = 0;
    let messagesWithAttachments = 0;
    
    for (let i = 0; i < Math.min(3, spaces.length); i++) {
      const space = spaces[i];
      const spaceId = space.name;
      const displayName = space.displayName || '(Direct Message)';
      
      console.log(`2️⃣ Checking space: ${displayName} (${spaceId})`);
      
      try {
        // Get message list (basic info)
        const messageRes = await chat.spaces.messages.list({
          parent: spaceId,
          pageSize: 10, // Limit for testing
        });
        
        const messages = messageRes.data.messages || [];
        totalMessages += messages.length;
        console.log(`   📨 Found ${messages.length} messages`);
        
        if (messages.length === 0) {
          console.log('   ⚠️  No messages in this space');
          continue;
        }
        
        // Test 3: Check each message for attachments
        for (let j = 0; j < Math.min(3, messages.length); j++) {
          const message = messages[j];
          console.log(`\n   🔍 Message ${j + 1}: "${(message.text || '(no text)').substring(0, 50)}..."`);
          
          // Check basic message structure for attachments
          const hasAttachmentsField = !!message.attachments;
          const hasAttachmentField = !!message.attachment;
          const attachmentCount = message.attachments ? message.attachments.length : 0;
          
          console.log(`      - Has 'attachments' field: ${hasAttachmentsField}`);
          console.log(`      - Has 'attachment' field: ${hasAttachmentField}`);
          console.log(`      - Attachment count: ${attachmentCount}`);
          
          if (attachmentCount > 0) {
            messagesWithAttachments++;
            console.log(`      📎 Found ${attachmentCount} attachments:`);
            
            message.attachments.forEach((att, index) => {
              console.log(`         ${index + 1}. Name: ${att.name || att.contentName || 'Unknown'}`);
              console.log(`            Type: ${att.contentType || 'Unknown'}`);
              console.log(`            Source: ${att.source || 'Unknown'}`);
              console.log(`            Has downloadUri: ${!!att.downloadUri}`);
              console.log(`            Has thumbnailUri: ${!!att.thumbnailUri}`);
              console.log(`            Has attachmentDataRef: ${!!att.attachmentDataRef}`);
              console.log(`            Has driveDataRef: ${!!att.driveDataRef}`);
            });
          }
          
          // Test 4: Try fetching full message details
          try {
            console.log(`      🔍 Fetching full message details...`);
            const fullMessage = await chat.spaces.messages.get({
              name: message.name
            });
            
            const fullAttachments = fullMessage.data.attachments || fullMessage.data.attachment || [];
            if (fullAttachments.length > 0) {
              console.log(`      ✅ Full message has ${fullAttachments.length} attachments`);
              
              // Compare with basic message
              if (fullAttachments.length !== attachmentCount) {
                console.log(`      ⚠️  Attachment count differs: list=${attachmentCount}, full=${fullAttachments.length}`);
              }
            } else {
              console.log(`      ⚠️  Full message has no attachments (list showed ${attachmentCount})`);
            }
            
          } catch (fullMsgError) {
            console.log(`      ❌ Failed to get full message: ${fullMsgError.message}`);
          }
        }
        
      } catch (spaceError) {
        console.log(`   ❌ Failed to get messages for space: ${spaceError.message}`);
      }
      
      console.log(''); // Add spacing
    }
    
    // Summary
    console.log('📊 Summary:');
    console.log(`   - Total spaces checked: ${Math.min(3, spaces.length)}`);
    console.log(`   - Total messages found: ${totalMessages}`);
    console.log(`   - Messages with attachments: ${messagesWithAttachments}`);
    
    if (messagesWithAttachments === 0) {
      console.log('\n⚠️  No messages with attachments found. This could mean:');
      console.log('1. No media files have been shared in these chats');
      console.log('2. Attachments are stored in a different field structure');
      console.log('3. The API response format has changed');
      console.log('\n💡 Try:');
      console.log('1. Send a test image/file in Google Chat');
      console.log('2. Run this test again');
      console.log('3. Check if the attachment appears in the API response');
    } else {
      console.log(`\n✅ Found ${messagesWithAttachments} messages with attachments!`);
      console.log('   The Google Chat API is returning attachment data correctly.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('insufficient authentication scopes')) {
      console.log('\n🔧 Fix: Ensure these scopes are enabled in Google Cloud Console:');
      console.log('   - https://www.googleapis.com/auth/chat.spaces.readonly');
      console.log('   - https://www.googleapis.com/auth/chat.messages.readonly');
      console.log('   - https://www.googleapis.com/auth/admin.directory.user.readonly');
      console.log('   - https://www.googleapis.com/auth/drive.readonly');
    }
    
    if (error.message.includes('domain-wide delegation')) {
      console.log('\n🔧 Fix: Enable domain-wide delegation for the service account');
    }
  }
}

// Run the test
testChatAPIAttachments();
