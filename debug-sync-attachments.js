#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

async function debugSyncAttachments() {
  console.log('🔍 Debug: Tracing Attachment Processing During Sync\n');
  
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/email_scrap');
    console.log('✅ Connected to MongoDB');
    
    // Find accounts
    const accounts = await Account.find({}).select('email name status');
    console.log(`📧 Found ${accounts.length} accounts`);
    
    if (accounts.length === 0) {
      console.log('❌ No accounts found. Please add an account first.');
      return;
    }
    
    const account = accounts[0];
    console.log(`🔑 Testing with account: ${account.email}\n`);
    
    // Setup Google Chat API (same as sync service)
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
      account.email
    );

    const chat = google.chat({ version: "v1", auth });
    
    // Get CMC space (we know it has attachments)
    const spaceRes = await chat.spaces.list();
    const spaces = spaceRes.data.spaces || [];
    const cmcSpace = spaces.find(s => s.displayName === 'CMC');
    
    if (!cmcSpace) {
      console.log('❌ CMC space not found');
      return;
    }
    
    console.log(`🔍 Testing CMC space: ${cmcSpace.name}`);
    
    // Get messages (same as sync service)
    const messageRes = await chat.spaces.messages.list({
      parent: cmcSpace.name,
      pageSize: 5,
    });
    
    const rawMessages = messageRes.data.messages || [];
    console.log(`📨 Found ${rawMessages.length} raw messages\n`);
    
    // Process each message exactly like the sync service
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      console.log(`\n📋 Processing message ${i + 1}: ${m.name}`);
      console.log(`    Text: "${(m.text || '(no text)').substring(0, 50)}..."`);
      
      // Step 1: Check basic message for attachments
      const basicAttachments = m.attachments || m.attachment || [];
      console.log(`    Basic attachments: ${basicAttachments.length}`);
      
      // Step 2: Get full message details (the critical step)
      let fullMessage;
      let fullMessageData;
      try {
        console.log('    🔍 Fetching full message details...');
        fullMessage = await chat.spaces.messages.get({
          name: m.name
        });
        fullMessageData = fullMessage.data; // This is the fix!
        console.log('    ✅ Got full message data');
      } catch (error) {
        console.error(`    ❌ Failed to get full message details: ${error.message}`);
        fullMessageData = m; // fallback
      }
      
      // Step 3: Check for attachments in full message (the key fix)
      const attachments = fullMessageData.attachments || fullMessageData.attachment || [];
      console.log(`    📎 Full message attachments: ${attachments.length}`);
      
      if (attachments.length > 0) {
        console.log(`    🎯 FOUND ATTACHMENTS! Details:`);
        attachments.forEach((att, index) => {
          console.log(`       ${index + 1}. Name: ${att.name || att.contentName}`);
          console.log(`          Type: ${att.contentType}`);
          console.log(`          Source: ${att.source}`);
        });
        
        // Step 4: Process attachments through media service
        try {
          console.log('    🔄 Processing through media service...');
          const messageWithAttachments = { ...fullMessageData, attachments };
          const processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(
            messageWithAttachments, 
            auth
          );
          
          console.log(`    ✅ Media service processed ${processedAttachments.length} attachments:`);
          processedAttachments.forEach((att, index) => {
            console.log(`       ${index + 1}. ${att.filename} (${att.mediaType}) - Status: ${att.downloadStatus}`);
          });
          
          // Step 5: Check what would be saved to database
          const messageToSave = {
            messageId: m.name,
            text: m.text || "(no text)",
            attachments: processedAttachments, // This should not be empty!
            createTime: new Date(m.createTime),
            hasAttachments: processedAttachments.length > 0
          };
          
          console.log('    💾 What would be saved to database:');
          console.log(`       - messageId: ${messageToSave.messageId}`);
          console.log(`       - text: ${messageToSave.text}`);
          console.log(`       - attachments.length: ${messageToSave.attachments.length}`);
          console.log(`       - hasAttachments: ${messageToSave.hasAttachments}`);
          
          // Step 6: Check what's actually in the database
          const existingChat = await Chat.findOne({ 
            account: account._id, 
            spaceId: cmcSpace.name 
          });
          
          if (existingChat) {
            const existingMessage = existingChat.messages.find(msg => msg.messageId === m.name);
            if (existingMessage) {
              console.log('    📊 What\'s currently in database:');
              console.log(`       - messageId: ${existingMessage.messageId}`);
              console.log(`       - text: ${existingMessage.text}`);
              console.log(`       - attachments.length: ${existingMessage.attachments ? existingMessage.attachments.length : 'undefined'}`);
              console.log(`       - hasAttachments: ${existingMessage.hasAttachments}`);
              
              if (existingMessage.attachments && existingMessage.attachments.length > 0) {
                console.log('    ✅ Attachments ARE saved in database!');
              } else {
                console.log('    ❌ Attachments are NOT saved in database - this is the problem!');
              }
            } else {
              console.log('    ⚠️  Message not found in database yet');
            }
          } else {
            console.log('    ⚠️  Chat not found in database yet');
          }
          
        } catch (processError) {
          console.log(`    ❌ Media processing failed: ${processError.message}`);
        }
      } else {
        console.log(`    ⚪ No attachments in this message`);
      }
    }
    
    console.log('\n🎯 Debug Summary:');
    console.log('This script traces the exact same steps as the sync service.');
    console.log('If attachments are found here but not in the database, then:');
    console.log('1. The sync service might not be using the fixed code');
    console.log('2. There might be an error during the save process');
    console.log('3. The database might be getting overwritten');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

debugSyncAttachments();
