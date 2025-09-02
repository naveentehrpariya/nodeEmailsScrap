const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixBidirectionalChats() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails');
    console.log('✅ Connected to MongoDB Atlas');
    
    console.log('\n🔄 FIXING BIDIRECTIONAL CHAT SYNC:');
    console.log('='.repeat(50));
    
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const narenderAccount = await Account.findOne({ email: 'narender@crossmilescarrier.com' });
    const dispatchAccount = await Account.findOne({ email: 'dispatch@crossmilescarrier.com' });
    
    if (!naveendevAccount) {
      console.log('❌ Naveendev account not found');
      return;
    }
    
    console.log(`📧 Naveendev Account ID: ${naveendevAccount._id}`);
    
    const spacesToFix = [
      {
        name: 'Narender',
        spaceId: 'spaces/ilSNZCAAAAE',
        sourceAccount: narenderAccount,
        targetEmail: 'narender@crossmilescarrier.com'
      },
      {
        name: 'Dispatch', 
        spaceId: 'spaces/w9y_pCAAAAE',
        sourceAccount: dispatchAccount,
        targetEmail: 'dispatch@crossmilescarrier.com'
      }
    ];
    
    let totalFixedChats = 0;
    let totalAddedMessages = 0;
    
    for (const spaceInfo of spacesToFix) {
      console.log(`\n🔍 Processing ${spaceInfo.name} chat (${spaceInfo.spaceId}):`);
      
      if (!spaceInfo.sourceAccount) {
        console.log(`   ❌ ${spaceInfo.name} account not found, skipping...`);
        continue;
      }
      
      // Get the chat from source account (narender/dispatch)
      const sourceChat = await Chat.findOne({ 
        spaceId: spaceInfo.spaceId, 
        account: spaceInfo.sourceAccount._id 
      }).lean();
      
      // Get the chat from naveendev account
      const targetChat = await Chat.findOne({ 
        spaceId: spaceInfo.spaceId, 
        account: naveendevAccount._id 
      });
      
      if (!sourceChat) {
        console.log(`   ❌ Source chat not found in ${spaceInfo.name} account`);
        continue;
      }
      
      if (!targetChat) {
        console.log(`   ❌ Target chat not found in naveendev account`);
        continue;
      }
      
      console.log(`   ✅ Found both chats:`);
      console.log(`      - Source (${spaceInfo.name}): ${sourceChat.messages.length} messages`);
      console.log(`      - Target (naveendev): ${targetChat.messages.length} messages`);
      
      // Find messages that exist in source but not in target
      const targetMessageIds = new Set(targetChat.messages.map(msg => msg.messageId));
      const missingMessages = sourceChat.messages.filter(msg => !targetMessageIds.has(msg.messageId));
      
      console.log(`   📨 Missing messages in naveendev account: ${missingMessages.length}`);
      
      if (missingMessages.length > 0) {
        console.log(`   🔄 Adding missing messages...`);
        
        // Add missing messages to target chat
        missingMessages.forEach(msg => {
          // Ensure the message has proper sender info
          const newMessage = {
            ...msg,
            // Make sure it's not marked as sent by current user if it's from other account
            isSentByCurrentUser: msg.senderEmail === naveendevAccount.email
          };
          
          targetChat.messages.push(newMessage);
          console.log(`      + "${msg.text}" from ${msg.senderDisplayName || msg.senderEmail}`);
        });
        
        // Update chat metadata
        targetChat.messageCount = targetChat.messages.length;
        
        // Update last message time
        const allTimes = targetChat.messages.map(m => new Date(m.createTime));
        targetChat.lastMessageTime = new Date(Math.max(...allTimes));
        
        // Sort messages by create time
        targetChat.messages.sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
        
        await targetChat.save();
        
        console.log(`   ✅ Fixed chat: added ${missingMessages.length} messages`);
        totalFixedChats++;
        totalAddedMessages += missingMessages.length;
      } else {
        console.log(`   ✅ Chat is already synchronized`);
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   - Fixed chats: ${totalFixedChats}`);
    console.log(`   - Added messages: ${totalAddedMessages}`);
    
    if (totalAddedMessages > 0) {
      console.log(`\n🎉 SUCCESS! The missing chats should now appear in naveendev's API response.`);
      console.log(`\nThe chats will now show proper participants and should be visible as:`);
      console.log(`   - Chat with narender@crossmilescarrier.com`);
      console.log(`   - Chat with dispatch@crossmilescarrier.com`);
    } else {
      console.log(`\n💡 No messages needed to be added. The chats may be filtered for other reasons.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

fixBidirectionalChats();
