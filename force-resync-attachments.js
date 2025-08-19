#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

async function forceResyncAttachments() {
  console.log('🔄 Force Re-sync Messages with Attachments\n');
  
  try {
    // Connect to cloud database
    await mongoose.connect(process.env.DB_URL_OFFICE);
    console.log('✅ Connected to cloud database');
    
    // Find the account
    const account = await Account.findById('688a57a80522df6d53bcc211');
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log(`🔑 Processing account: ${account.email}\n`);
    
    // Setup Google Chat API
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
    
    // Find messages with "(no text)" but no attachments (these are the problematic ones)
    const chats = await Chat.find({ account: account._id });
    const problematicMessages = [];
    
    chats.forEach(chatDoc => {
      chatDoc.messages.forEach(msg => {
        if (msg.text === "(no text)" && (!msg.attachments || msg.attachments.length === 0)) {
          problematicMessages.push({
            chatDoc: chatDoc,
            message: msg,
            spaceId: chatDoc.spaceId,
            messageId: msg.messageId
          });
        }
      });
    });
    
    console.log(`🎯 Found ${problematicMessages.length} problematic messages to re-process\n`);
    
    // Re-process each problematic message
    for (const { chatDoc, message, messageId } of problematicMessages) {
      console.log(`📋 Re-processing: ${messageId}`);
      
      try {
        // Fetch full message details from Google Chat API (with the fix!)
        const fullMessage = await chat.spaces.messages.get({
          name: messageId
        });
        
        const fullMessageData = fullMessage.data; // THE FIX!
        const attachments = fullMessageData.attachments || fullMessageData.attachment || [];
        
        console.log(`   📎 Found ${attachments.length} attachments in full message`);
        
        if (attachments.length > 0) {
          // Process attachments through media service
          const messageWithAttachments = { ...fullMessageData, attachments };
          const processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(
            messageWithAttachments, 
            auth
          );
          
          console.log(`   ✅ Processed ${processedAttachments.length} attachments:`);
          processedAttachments.forEach((att, index) => {
            console.log(`      ${index + 1}. ${att.filename} (${att.mediaType}) - Status: ${att.downloadStatus}`);
          });
          
          // Update the message in the database
          const messageIndex = chatDoc.messages.findIndex(m => m.messageId === messageId);
          if (messageIndex !== -1) {
            chatDoc.messages[messageIndex].attachments = processedAttachments;
            chatDoc.messages[messageIndex].hasAttachments = processedAttachments.length > 0;
            chatDoc.messages[messageIndex].hasMedia = processedAttachments.some(att => att.isImage || att.isVideo);
            chatDoc.messages[messageIndex].hasDocuments = processedAttachments.some(att => att.isDocument);
            
            // Save the updated chat
            await chatDoc.save();
            console.log(`   💾 Updated message in database`);
          }
          
        } else {
          console.log(`   ⚪ No attachments found in full message`);
        }
        
      } catch (error) {
        console.log(`   ❌ Failed to re-process: ${error.message}`);
      }
      
      console.log(''); // Add spacing
    }
    
    console.log('🎉 Re-sync completed! Checking results...\n');
    
    // Check the results
    const updatedChats = await Chat.find({ account: account._id });
    let messagesWithAttachments = 0;
    let stillProblematicMessages = 0;
    
    updatedChats.forEach(chatDoc => {
      chatDoc.messages.forEach(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          messagesWithAttachments++;
        } else if (msg.text === "(no text)") {
          stillProblematicMessages++;
        }
      });
    });
    
    console.log(`📊 Results:`);
    console.log(`   - Messages with attachments: ${messagesWithAttachments}`);
    console.log(`   - Still problematic messages: ${stillProblematicMessages}`);
    
    if (messagesWithAttachments > 0) {
      console.log(`\n✅ SUCCESS: ${messagesWithAttachments} messages now have attachments!`);
      console.log(`   Your frontend should now display media files instead of "no text"`);
    }
    
    if (stillProblematicMessages > 0) {
      console.log(`\n⚠️  Still ${stillProblematicMessages} messages with "(no text)" but no attachments`);
      console.log(`   These might be genuine text-only messages or messages without media`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

forceResyncAttachments();
