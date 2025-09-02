require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const chatSyncService = require('./services/chatSyncService');

async function debugChatSyncProcess() {
  try {
    console.log('🔍 DEBUGGING CHAT SYNC PROCESS');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    console.log(`👤 Account: ${naveendevAccount.email}`);
    console.log(`📅 Last sync: ${naveendevAccount.lastSync || 'Never'}`);
    console.log(`💬 Last chat sync: ${naveendevAccount.lastChatSync || 'Never'}`);
    
    // Check current database state before sync
    console.log('\n📊 CURRENT DATABASE STATE (before sync):');
    const currentChats = await Chat.find({ account: naveendevAccount._id }).lean();
    console.log(`   Total chats in DB: ${currentChats.length}`);
    
    // List all current chats
    currentChats.forEach((chat, i) => {
      console.log(`   ${i + 1}. "${chat.displayName}" (${chat.spaceType}) - ${chat.spaceId}`);
      console.log(`      Messages: ${chat.messages.length}, Participants: ${chat.participants.length}`);
      console.log(`      Last activity: ${chat.lastMessageTime}`);
    });
    
    // Test the sync service directly
    console.log('\n🔄 TESTING CHAT SYNC SERVICE:');
    console.log('='.repeat(40));
    
    try {
      console.log('📡 Starting chat sync...');
      
      // Call the chat sync service
      const syncResult = await chatSyncService.syncChatsForAccount(naveendevAccount._id);
      
      console.log('✅ Sync completed successfully');
      console.log(`📊 Sync result:`, syncResult);
      
    } catch (syncError) {
      console.error('❌ Sync failed:', syncError.message);
      console.error('Stack:', syncError.stack);
    }
    
    // Check database state after sync
    console.log('\n📊 DATABASE STATE AFTER SYNC:');
    const updatedChats = await Chat.find({ account: naveendevAccount._id }).lean();
    console.log(`   Total chats in DB: ${updatedChats.length}`);
    
    // Compare before and after
    const newChats = updatedChats.filter(updated => 
      !currentChats.some(current => current.spaceId === updated.spaceId)
    );
    
    const updatedExistingChats = updatedChats.filter(updated => 
      currentChats.some(current => 
        current.spaceId === updated.spaceId && 
        current.messages.length !== updated.messages.length
      )
    );
    
    console.log(`\n🆕 NEW CHATS ADDED (${newChats.length}):`);
    newChats.forEach((chat, i) => {
      console.log(`   ${i + 1}. "${chat.displayName}" (${chat.spaceType}) - ${chat.spaceId}`);
      console.log(`      Messages: ${chat.messages.length}, Participants: ${chat.participants.length}`);
    });
    
    console.log(`\n🔄 EXISTING CHATS UPDATED (${updatedExistingChats.length}):`);
    updatedExistingChats.forEach((chat, i) => {
      const originalChat = currentChats.find(c => c.spaceId === chat.spaceId);
      console.log(`   ${i + 1}. "${chat.displayName}" (${chat.spaceType})`);
      console.log(`      Messages: ${originalChat.messages.length} → ${chat.messages.length}`);
    });
    
    // Check if our problematic chat is now present
    const problemChat = updatedChats.find(c => c.spaceId === 'spaces/2pUolCAAAAE');
    if (problemChat) {
      console.log(`\n🎯 FOUND THE MISSING CHAT!`);
      console.log(`   Display Name: "${problemChat.displayName}"`);
      console.log(`   Messages: ${problemChat.messages.length}`);
      console.log(`   Participants: ${problemChat.participants.length}`);
      console.log(`   Last activity: ${problemChat.lastMessageTime}`);
    } else {
      console.log(`\n❌ The missing chat (spaces/2pUolCAAAAE) is still not present after sync`);
    }
    
    // Analyze sync service configuration
    console.log('\n⚙️ SYNC SERVICE ANALYSIS:');
    console.log('='.repeat(30));
    
    // Check if there are any filters or limitations in the sync service
    console.log('🔍 Checking sync service configuration...');
    
    // This would require examining the actual sync service code
    console.log('💡 Potential issues to investigate:');
    console.log('   1. Date/time filters limiting recent messages');
    console.log('   2. Pagination limits in Google Chat API calls');
    console.log('   3. Filtering logic excluding certain types of chats');
    console.log('   4. Rate limiting causing incomplete syncs');
    console.log('   5. Error handling skipping problematic chats');
    
    // Final recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('='.repeat(30));
    console.log('1. 🔍 Review chat sync service code for filtering logic');
    console.log('2. 📅 Check if date filters are too restrictive');
    console.log('3. 🔄 Implement full sync (not just incremental)');
    console.log('4. 📊 Add better logging to sync process');
    console.log('5. 🚫 Remove any user registration dependencies from sync');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugChatSyncProcess();
