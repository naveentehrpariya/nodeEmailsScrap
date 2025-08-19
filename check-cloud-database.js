#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');

async function checkCloudDatabase() {
  console.log('☁️ Checking Cloud Database (MongoDB Atlas)\n');
  
  try {
    // Use the same connection as the backend
    const dbUrl = process.env.DB_URL_OFFICE;
    console.log(`🔗 Connecting to: ${dbUrl.replace(/:[^:]*@/, ':***@')}`);
    
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to cloud database\n');
    
    // Check accounts
    const accounts = await Account.find({});
    console.log(`📧 Accounts in cloud database: ${accounts.length}`);
    accounts.forEach(acc => {
      console.log(`  - ${acc.email} (ID: ${acc._id})`);
    });
    
    if (accounts.length === 0) {
      console.log('❌ No accounts found in cloud database');
      console.log('   You need to add an account via the frontend first');
      return;
    }
    
    // Check chats
    const chats = await Chat.find({});
    console.log(`\n💬 Chats in cloud database: ${chats.length}`);
    
    let totalMessages = 0;
    let messagesWithAttachments = 0;
    let emptyAttachmentMessages = 0;
    
    chats.forEach(chat => {
      console.log(`\n📁 Chat: ${chat.displayName} (${chat.spaceId})`);
      console.log(`   Account: ${chat.account}`);
      console.log(`   Messages: ${chat.messages.length}`);
      
      totalMessages += chat.messages.length;
      
      chat.messages.forEach(msg => {
        const hasAttachments = msg.attachments && msg.attachments.length > 0;
        if (hasAttachments) {
          messagesWithAttachments++;
          console.log(`   ✅ Message with ${msg.attachments.length} attachments: ${msg.messageId}`);
          msg.attachments.forEach((att, index) => {
            console.log(`      ${index + 1}. ${att.filename || att.name} (${att.mediaType})`);
          });
        } else if (msg.text === "(no text)") {
          emptyAttachmentMessages++;
          console.log(`   ❌ Message with "(no text)" but no attachments: ${msg.messageId}`);
        }
      });
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`   - Total chats: ${chats.length}`);
    console.log(`   - Total messages: ${totalMessages}`);
    console.log(`   - Messages with attachments: ${messagesWithAttachments}`);
    console.log(`   - Messages with "(no text)" but no attachments: ${emptyAttachmentMessages}`);
    
    if (emptyAttachmentMessages > 0) {
      console.log(`\n🎯 ISSUE CONFIRMED:`);
      console.log(`   ${emptyAttachmentMessages} messages have "(no text)" but empty attachments`);
      console.log(`   This confirms that the attachment processing bug affected the sync`);
      console.log(`\n🔧 SOLUTION:`);
      console.log(`   1. The fix has been applied to the sync service`);
      console.log(`   2. Run a new sync to re-process these messages`);
      console.log(`   3. The attachments should be detected and saved properly`);
    } else if (messagesWithAttachments > 0) {
      console.log(`\n✅ GOOD NEWS:`);
      console.log(`   ${messagesWithAttachments} messages already have attachments saved`);
      console.log(`   The attachment processing is working!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('\n🔧 Fix: Check your MongoDB Atlas credentials in .env file');
    }
    if (error.message.includes('network')) {
      console.log('\n🔧 Fix: Check your internet connection and MongoDB Atlas network access');
    }
  } finally {
    await mongoose.connection.close();
  }
}

checkCloudDatabase();
