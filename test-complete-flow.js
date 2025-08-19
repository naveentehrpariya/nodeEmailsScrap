#!/usr/bin/env node

const axios = require('axios');
const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');

const BASE_URL = 'http://localhost:8080';

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Media Message Flow\n');
  
  try {
    // Test 1: Check backend health
    console.log('1️⃣ Testing backend health...');
    const healthResponse = await axios.get(`${BASE_URL}/`);
    console.log('✅ Backend is responding:', healthResponse.data.message);
    
    // Test 2: Check database connection
    console.log('\n2️⃣ Testing database connection...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/email_scrap');
    console.log('✅ Connected to MongoDB');
    
    // Test 3: Check accounts in database
    console.log('\n3️⃣ Checking accounts in database...');
    const accounts = await Account.find({}).select('email name status');
    console.log(`📊 Found ${accounts.length} accounts in database`);
    
    if (accounts.length === 0) {
      console.log('❌ No accounts found in database');
      console.log('\n🔧 To fix this:');
      console.log('1. Open frontend: http://localhost:3000');
      console.log('2. Add a Google account with proper scopes');
      console.log('3. Ensure these scopes are enabled:');
      console.log('   - chat.spaces.readonly');
      console.log('   - chat.messages.readonly');
      console.log('   - admin.directory.user.readonly');
      console.log('   - drive.readonly');
      return;
    }
    
    accounts.forEach(acc => {
      console.log(`  - ${acc.email} (${acc.name}) - Status: ${acc.status}`);
    });
    
    // Test 4: Check chats in database
    console.log('\n4️⃣ Checking chats in database...');
    const chatCount = await Chat.countDocuments({});
    console.log(`📊 Found ${chatCount} chats in database`);
    
    if (chatCount === 0) {
      console.log('❌ No chats found in database');
      console.log('\n🔧 To sync chats:');
      console.log('1. Use the frontend to trigger chat sync');
      console.log('2. Or call API directly:');
      accounts.forEach(acc => {
        console.log(`   POST ${BASE_URL}/api/chat/sync/account/${acc._id}`);
      });
      return;
    }
    
    // Test 5: Check for messages with attachments
    console.log('\n5️⃣ Checking for messages with attachments...');
    const chatsWithAttachments = await Chat.find({
      $or: [
        { 'messages.attachments': { $exists: true, $ne: [] } },
        { 'messages.attachment': { $exists: true, $ne: [] } }
      ]
    }).select('displayName messages');
    
    console.log(`📊 Found ${chatsWithAttachments.length} chats with attachments`);
    
    if (chatsWithAttachments.length === 0) {
      console.log('❌ No messages with attachments found');
      console.log('\n🔧 This means:');
      console.log('1. Either no media messages exist in your Google Chat');
      console.log('2. Or the sync process isn\'t detecting attachments properly');
      console.log('3. Try sending a test image/file in Google Chat, then sync again');
      return;
    }
    
    // Test 6: Examine attachment structure
    console.log('\n6️⃣ Examining attachment structure...');
    let totalAttachments = 0;
    let processedAttachments = 0;
    
    chatsWithAttachments.forEach(chat => {
      chat.messages.forEach(msg => {
        const attachments = msg.attachments || msg.attachment || [];
        if (attachments.length > 0) {
          totalAttachments += attachments.length;
          attachments.forEach(att => {
            if (att.localPath && att.downloadStatus === 'completed') {
              processedAttachments++;
            }
          });
        }
      });
    });
    
    console.log(`📊 Total attachments found: ${totalAttachments}`);
    console.log(`📊 Processed attachments: ${processedAttachments}`);
    
    // Test 7: Test frontend endpoints
    console.log('\n7️⃣ Testing frontend chat endpoints...');
    const firstAccount = accounts[0];
    
    try {
      const chatsResponse = await axios.get(`${BASE_URL}/api/chat/account/${firstAccount._id}`);
      console.log(`✅ Chat API working - found ${chatsResponse.data.data.chats.length} chats`);
      
      if (chatsResponse.data.data.chats.length > 0) {
        const firstChat = chatsResponse.data.data.chats[0];
        const messagesResponse = await axios.get(`${BASE_URL}/api/chat/${firstChat._id}/messages`);
        console.log(`✅ Messages API working - found ${messagesResponse.data.data.messages.length} messages`);
        
        // Check if any messages have attachments
        const messagesWithAttachments = messagesResponse.data.data.messages.filter(msg => 
          msg.attachments && msg.attachments.length > 0
        );
        console.log(`📊 Messages with attachments in API response: ${messagesWithAttachments.length}`);
        
        if (messagesWithAttachments.length > 0) {
          console.log('✅ Media messages are properly available via API!');
          console.log('\n🎯 Your ChatMessage component should now display attachments correctly');
          console.log('   Visit: http://localhost:3000/test-chat to test the component');
        }
      }
    } catch (apiError) {
      console.log('❌ API endpoint error:', apiError.message);
    }
    
    // Test 8: Check media processing service
    console.log('\n8️⃣ Testing media processing...');
    try {
      const mediaStatsResponse = await axios.get(`${BASE_URL}/api/media/stats`);
      console.log('✅ Media service responding:', mediaStatsResponse.data);
    } catch (mediaError) {
      console.log('❌ Media service error:', mediaError.response?.data || mediaError.message);
    }
    
    console.log('\n🎉 Complete flow test finished!');
    console.log('\n📋 Summary:');
    console.log(`   - Accounts: ${accounts.length}`);
    console.log(`   - Chats: ${chatCount}`);
    console.log(`   - Total attachments: ${totalAttachments}`);
    console.log(`   - Processed attachments: ${processedAttachments}`);
    
    if (totalAttachments > 0) {
      console.log('\n✅ Media messages should now work in your frontend!');
      console.log('   Test URLs:');
      console.log('   - http://localhost:3000/test-chat (Component test)');
      console.log('   - http://localhost:3000/debug-media (Media debug)');
      console.log(`   - http://localhost:3000/account/${firstAccount.email}/chats (Real chats)`);
    } else {
      console.log('\n⚠️  No media attachments found. Send some files in Google Chat and sync again.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the test
testCompleteFlow();
