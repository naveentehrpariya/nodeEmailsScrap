require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const ChatSyncService = require('./services/chatSyncService');

async function debugChatSyncFixed() {
  try {
    console.log('🔍 DEBUGGING CHAT SYNC PROCESS (CORRECTED)');
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
    console.log('\\n📊 CURRENT DATABASE STATE (before sync):');
    const currentChats = await Chat.find({ account: naveendevAccount._id }).lean();
    console.log(`   Total chats in DB: ${currentChats.length}`);
    
    // Show summary of current chats
    currentChats.forEach((chat, i) => {
      const isRecent = new Date(chat.lastMessageTime) > new Date(Date.now() - 60 * 60 * 1000); // Last hour
      console.log(`   ${i + 1}. \"${chat.displayName}\" (${chat.spaceType}) ${isRecent ? '🔥' : ''}`);\n      console.log(`      SpaceID: ${chat.spaceId}`);\n      console.log(`      Messages: ${chat.messages.length}, Participants: ${chat.participants.length}`);\n    });\n    \n    // Create chat sync service instance\n    const chatSyncService = new ChatSyncService();\n    \n    // Test the sync service directly\n    console.log('\\n🔄 RUNNING CHAT SYNC FOR NAVEENDEV:');\n    console.log('='.repeat(40));\n    \n    try {\n      console.log('📡 Starting chat sync...');\n      \n      // Call the correct method\n      const syncResult = await chatSyncService.syncAccountChats(naveendevAccount);\n      \n      console.log('✅ Sync completed successfully');\n      console.log(`📊 Sync result:`);\n      console.log(`   - Synced chats: ${syncResult.syncedChats}`);\n      console.log(`   - Synced messages: ${syncResult.syncedMessages}`);\n      console.log(`   - Total spaces: ${syncResult.totalSpaces}`);\n      console.log(`   - Duration: ${syncResult.duration}ms`);\n      \n    } catch (syncError) {\n      console.error('❌ Sync failed:', syncError.message);\n      console.error('Stack:', syncError.stack);\n    }\n    \n    // Check database state after sync\n    console.log('\\n📊 DATABASE STATE AFTER SYNC:');\n    const updatedChats = await Chat.find({ account: naveendevAccount._id })\n      .sort({ lastMessageTime: -1 })\n      .lean();\n    console.log(`   Total chats in DB: ${updatedChats.length}`);\n    \n    // Compare before and after\n    const newChats = updatedChats.filter(updated => \n      !currentChats.some(current => current.spaceId === updated.spaceId)\n    );\n    \n    const updatedExistingChats = updatedChats.filter(updated => \n      currentChats.some(current => \n        current.spaceId === updated.spaceId && \n        current.messages.length !== updated.messages.length\n      )\n    );\n    \n    console.log(`\\n🆕 NEW CHATS DISCOVERED (${newChats.length}):`);\n    if (newChats.length === 0) {\n      console.log('   No new chats found');\n    } else {\n      newChats.forEach((chat, i) => {\n        console.log(`   ${i + 1}. \"${chat.displayName}\" (${chat.spaceType})`);\n        console.log(`      SpaceID: ${chat.spaceId}`);\n        console.log(`      Messages: ${chat.messages.length}, Participants: ${chat.participants.length}`);\n        console.log(`      Last activity: ${chat.lastMessageTime}`);\n      });\n    }\n    \n    console.log(`\\n🔄 EXISTING CHATS UPDATED (${updatedExistingChats.length}):`);\n    if (updatedExistingChats.length === 0) {\n      console.log('   No existing chats were updated');\n    } else {\n      updatedExistingChats.forEach((chat, i) => {\n        const originalChat = currentChats.find(c => c.spaceId === chat.spaceId);\n        console.log(`   ${i + 1}. \"${chat.displayName}\" (${chat.spaceType})`);\n        console.log(`      Messages: ${originalChat.messages.length} → ${chat.messages.length}`);\n        console.log(`      Participants: ${originalChat.participants.length} → ${chat.participants.length}`);\n      });\n    }\n    \n    // Check for our specific problematic chat\n    const testMessageChat = updatedChats.find(c => c.spaceId === 'spaces/2pUolCAAAAE');\n    console.log(`\\n🎯 CHECKING FOR TEST MESSAGE CHAT (spaces/2pUolCAAAAE):`);\n    if (testMessageChat) {\n      console.log(`   ✅ FOUND!`);\n      console.log(`   Display Name: \"${testMessageChat.displayName}\"`);\n      console.log(`   Messages: ${testMessageChat.messages.length}`);\n      console.log(`   Participants: ${testMessageChat.participants.length}`);\n      console.log(`   Last activity: ${testMessageChat.lastMessageTime}`);\n      \n      if (testMessageChat.messages.length > 0) {\n        console.log(`   📨 Messages:`);\n        testMessageChat.messages.forEach((msg, i) => {\n          console.log(`      ${i + 1}. \"${msg.text}\" (from: ${msg.senderEmail})`);\n        });\n      }\n    } else {\n      console.log(`   ❌ Still not found after sync!`);\n      console.log(`   💡 This indicates the sync process has filtering issues`);\n    }\n    \n    // Check if sync captured very recent activity\n    const veryRecentChats = updatedChats.filter(chat => {\n      const lastActivity = new Date(chat.lastMessageTime);\n      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);\n      return lastActivity > oneHourAgo;\n    });\n    \n    console.log(`\\n🕐 CHATS WITH RECENT ACTIVITY (last hour): ${veryRecentChats.length}`);\n    veryRecentChats.forEach((chat, i) => {\n      console.log(`   ${i + 1}. \"${chat.displayName}\" - ${chat.messages.length} messages`);\n      console.log(`      Last: ${new Date(chat.lastMessageTime).toLocaleString()}`);\n    });\n    \n  } catch (error) {\n    console.error('❌ Error:', error.message);\n    console.error(error.stack);\n  } finally {\n    mongoose.disconnect();\n    console.log('\\n🔌 Disconnected from database');\n  }\n}\n\ndebugChatSyncFixed();"
