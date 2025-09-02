require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const ChatSyncService = require('./services/chatSyncService');

async function testChatSyncNow() {
  try {
    console.log('🔍 TESTING CHAT SYNC RIGHT NOW');
    console.log('='.repeat(50));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    console.log(`👤 Account: ${naveendevAccount.email}`);
    console.log(`💬 Last chat sync: ${naveendevAccount.lastChatSync || 'Never'}`);
    
    // Count chats before sync
    const beforeCount = await Chat.countDocuments({ account: naveendevAccount._id });
    console.log(`📊 Chats before sync: ${beforeCount}`);
    
    // Get the sync service instance
    const chatSyncService = require('./services/chatSyncService');
    
    console.log('\n🔄 RUNNING SYNC...');
    const startTime = Date.now();
    
    try {
      const syncResult = await chatSyncService.syncAccountChats(naveendevAccount);
      const duration = Date.now() - startTime;
      
      console.log('✅ Sync completed successfully');
      console.log(`⏱️ Duration: ${duration}ms`);
      console.log(`📊 Results:`, syncResult);
      
    } catch (syncError) {
      console.error('❌ Sync failed:', syncError.message);
      return;
    }
    
    // Count chats after sync
    const afterCount = await Chat.countDocuments({ account: naveendevAccount._id });
    console.log(`\n📊 Chats after sync: ${afterCount}`);
    console.log(`📈 New chats discovered: ${afterCount - beforeCount}`);
    
    // Check for our test message chat specifically
    const testChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/2pUolCAAAAE' 
    }).lean();
    
    console.log(`\n🎯 Test message chat (spaces/2pUolCAAAAE):`);
    if (testChat) {
      console.log(`   ✅ FOUND!`);
      console.log(`   Messages: ${testChat.messages.length}`);
      console.log(`   Participants: ${testChat.participants.length}`);
      console.log(`   Display: "${testChat.displayName}"`);
      
      if (testChat.messages.length > 0) {
        console.log(`   Latest message: "${testChat.messages[testChat.messages.length - 1].text}"`);
      }
    } else {
      console.log(`   ❌ Still not found!`);
    }
    
    // Update account last sync time
    await Account.updateOne(
      { _id: naveendevAccount._id },
      { lastChatSync: new Date() }
    );
    
    console.log(`\n✅ Sync process completed`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

testChatSyncNow();
