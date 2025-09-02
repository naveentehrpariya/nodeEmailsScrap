require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function debugLatestMessageSync() {
  try {
    console.log('🔍 DEBUGGING LATEST MESSAGE SYNC ISSUE');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!naveendevAccount) {
      console.log('❌ NAVEENDEV ACCOUNT NOT FOUND!');
      return;
    }
    
    console.log(`👤 Found naveendev account: ${naveendevAccount._id}`);
    console.log(`📅 Last sync: ${naveendevAccount.lastSync || 'Never'}`);
    console.log(`💬 Last chat sync: ${naveendevAccount.lastChatSync || 'Never'}`);
    
    // Get all chats for naveendev sorted by last activity
    const chats = await Chat.find({ account: naveendevAccount._id })
      .sort({ lastMessageTime: -1 })
      .lean();
    
    console.log(`\n📊 CURRENT CHAT STATUS (${chats.length} chats):`);
    console.log('='.repeat(50));
    
    // Show recent activity from last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    console.log(`🕐 Checking for activity since: ${twoHoursAgo.toISOString()}`);
    
    let recentActivityFound = false;
    
    chats.forEach((chat, i) => {
      const lastMessageTime = new Date(chat.lastMessageTime);
      const isRecent = lastMessageTime > twoHoursAgo;
      
      console.log(`\n${i + 1}. "${chat.displayName}" (${chat.spaceType})`);
      console.log(`   Space ID: ${chat.spaceId}`);
      console.log(`   Messages: ${chat.messages.length}`);
      console.log(`   Last activity: ${lastMessageTime.toISOString()} ${isRecent ? '🔥 RECENT' : ''}`);
      console.log(`   Participants: ${chat.participants.length}`);
      
      if (chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        console.log(`   Last message: "${lastMessage.text}" (from: ${lastMessage.senderEmail || lastMessage.senderId})`);
        console.log(`   Message time: ${lastMessage.createTime}`);
        console.log(`   Sent by current user: ${lastMessage.isSentByCurrentUser}`);
        
        if (isRecent) {
          recentActivityFound = true;
          console.log(`   🎯 THIS CHAT HAS RECENT ACTIVITY!`);
        }
      }
    });
    
    if (!recentActivityFound) {
      console.log(`\n⚠️ NO RECENT ACTIVITY FOUND in existing chats`);
      console.log(`   This suggests either:`);
      console.log(`   1. The new message created a NEW chat that hasn't synced yet`);
      console.log(`   2. The sync process isn't working`);
      console.log(`   3. The message was sent to a space that isn't being synced`);
    }
    
    // Check sync process status
    console.log(`\n🔄 SYNC ANALYSIS:`);
    console.log('='.repeat(30));
    
    const now = new Date();
    const lastChatSync = naveendevAccount.lastChatSync ? new Date(naveendevAccount.lastChatSync) : null;
    
    if (lastChatSync) {
      const timeSinceLastSync = now - lastChatSync;
      const minutesSinceSync = Math.floor(timeSinceLastSync / (1000 * 60));
      
      console.log(`📅 Last chat sync: ${lastChatSync.toISOString()}`);
      console.log(`⏱️ Time since last sync: ${minutesSinceSync} minutes ago`);
      
      if (minutesSinceSync > 30) {
        console.log(`⚠️ WARNING: Last sync was over 30 minutes ago`);
        console.log(`   You may need to trigger a manual sync`);
      } else {
        console.log(`✅ Recent sync detected`);
      }
    } else {
      console.log(`❌ No chat sync timestamp found`);
    }
    
    // Check for any chats with very recent messages (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const veryRecentChats = chats.filter(chat => {
      const lastMessageTime = new Date(chat.lastMessageTime);
      return lastMessageTime > tenMinutesAgo;
    });
    
    console.log(`\n🕙 VERY RECENT ACTIVITY (last 10 minutes):`);
    if (veryRecentChats.length === 0) {
      console.log(`   ❌ No chats with activity in the last 10 minutes`);
    } else {
      veryRecentChats.forEach(chat => {
        console.log(`   🔥 "${chat.displayName}": ${chat.messages.length} messages`);
        if (chat.messages.length > 0) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          console.log(`      Latest: "${lastMsg.text}" at ${lastMsg.createTime}`);
        }
      });
    }
    
    // Recommendations
    console.log(`\n💡 TROUBLESHOOTING STEPS:`);
    console.log('='.repeat(40));
    
    if (!recentActivityFound) {
      console.log(`1. 🔄 Try running a manual chat sync:`);
      console.log(`   POST http://localhost:8080/test/account/naveendev@crossmilescarrier.com/sync-chats`);
      console.log(`\n2. 📧 Check if the message was sent to the correct recipient`);
      console.log(`\n3. 🕐 Wait a few minutes and check again (sync might be delayed)`);
      console.log(`\n4. 🔍 Check Google Chat web interface to verify the message exists`);
    }
    
    // Show who can be messaged (existing participants)
    console.log(`\n👥 EXISTING CONVERSATION PARTNERS:`);
    const participants = new Set();
    chats.forEach(chat => {
      if (chat.participants && chat.participants.length > 0) {
        chat.participants.forEach(p => {
          if (p.email !== 'naveendev@crossmilescarrier.com') {
            participants.add(`${p.displayName || 'Unknown'} (${p.email || 'no email'})`);
          }
        });
      }
    });
    
    if (participants.size > 0) {
      console.log(`   Found ${participants.size} conversation partners:`);
      Array.from(participants).forEach((partner, i) => {
        console.log(`   ${i + 1}. ${partner}`);
      });
    } else {
      console.log(`   ❌ No conversation partners found in existing chats`);
    }
    
    console.log(`\n📞 If you just sent a message to someone NEW:`);
    console.log(`   - The message might create a new chat that needs time to sync`);
    console.log(`   - Try the manual sync endpoint above`);
    console.log(`   - Check if the recipient's account is in the system`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugLatestMessageSync();
