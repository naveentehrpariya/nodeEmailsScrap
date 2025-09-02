require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function debugBidirectionalChats() {
  try {
    console.log('🔍 DEBUGGING BIDIRECTIONAL CHAT SYNC ISSUE');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Get all accounts
    const allAccounts = await Account.find({}).lean();
    console.log(`📊 Found ${allAccounts.length} accounts:`);
    allAccounts.forEach((account, i) => {
      console.log(`   ${i + 1}. ${account.email} (ID: ${account._id})`);
    });
    
    // Check each account for chats
    console.log('\n🔍 ANALYZING CHATS IN EACH ACCOUNT:');
    console.log('='.repeat(50));
    
    const targetSpaceIds = ['spaces/ilSNZCAAAAE', 'spaces/w9y_pCAAAAE'];
    const chatDistribution = new Map();
    
    for (const account of allAccounts) {
      console.log(`\n👤 ACCOUNT: ${account.email}`);
      
      const chats = await Chat.find({ account: account._id }).lean();
      console.log(`   Total chats: ${chats.length}`);
      
      // Look for our target chats
      const narenderChat = chats.find(c => c.spaceId === 'spaces/ilSNZCAAAAE');
      const dispatchChat = chats.find(c => c.spaceId === 'spaces/w9y_pCAAAAE');
      
      if (narenderChat || dispatchChat) {
        console.log(`   🎯 TARGET CHATS FOUND:`);
        
        if (narenderChat) {
          console.log(`      ✅ Narender chat (spaces/ilSNZCAAAAE):`);
          console.log(`         Display: "${narenderChat.displayName}"`);
          console.log(`         Messages: ${narenderChat.messages.length}`);
          console.log(`         Participants: ${narenderChat.participants.length}`);
          
          if (narenderChat.messages.length > 0) {
            console.log(`         Sample messages:`);
            narenderChat.messages.slice(0, 3).forEach((msg, i) => {
              console.log(`           ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
            });
          }
          
          // Track distribution
          if (!chatDistribution.has('narender')) {
            chatDistribution.set('narender', []);
          }
          chatDistribution.get('narender').push({
            account: account.email,
            messages: narenderChat.messages.length,
            participants: narenderChat.participants.length
          });
        }
        
        if (dispatchChat) {
          console.log(`      ✅ Dispatch chat (spaces/w9y_pCAAAAE):`);
          console.log(`         Display: "${dispatchChat.displayName}"`);
          console.log(`         Messages: ${dispatchChat.messages.length}`);
          console.log(`         Participants: ${dispatchChat.participants.length}`);
          
          if (dispatchChat.messages.length > 0) {
            console.log(`         Sample messages:`);
            dispatchChat.messages.slice(0, 3).forEach((msg, i) => {
              console.log(`           ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
            });
          }
          
          // Track distribution
          if (!chatDistribution.has('dispatch')) {
            chatDistribution.set('dispatch', []);
          }
          chatDistribution.get('dispatch').push({
            account: account.email,
            messages: dispatchChat.messages.length,
            participants: dispatchChat.participants.length
          });
        }
      } else {
        console.log(`   ❌ No target chats found`);
      }
    }
    
    // Summary of chat distribution
    console.log('\n📊 CHAT DISTRIBUTION SUMMARY:');
    console.log('='.repeat(40));
    
    for (const [chatName, locations] of chatDistribution.entries()) {
      console.log(`\n🎯 ${chatName.toUpperCase()} CHAT DISTRIBUTION:`);
      if (locations.length === 0) {
        console.log(`   ❌ Not found in any account!`);
      } else {
        locations.forEach(loc => {
          console.log(`   📋 ${loc.account}: ${loc.messages} messages, ${loc.participants} participants`);
        });
        
        // Check if it exists in naveendev's account
        const inNaveendev = locations.find(loc => loc.account === 'naveendev@crossmilescarrier.com');
        if (!inNaveendev) {
          console.log(`   ⚠️ MISSING from naveendev@crossmilescarrier.com account!`);
          console.log(`   💡 Need to sync this chat TO naveendev's account`);
        } else {
          console.log(`   ✅ EXISTS in naveendev's account`);
        }
      }
    }
    
    // Bidirectional sync analysis
    console.log('\n🔄 BIDIRECTIONAL SYNC ANALYSIS:');
    console.log('='.repeat(40));
    
    const naveendevAccount = allAccounts.find(a => a.email === 'naveendev@crossmilescarrier.com');
    const narenderAccount = allAccounts.find(a => a.email === 'narender@crossmilescarrier.com');
    const dispatchAccount = allAccounts.find(a => a.email === 'dispatch@crossmilescarrier.com');
    
    console.log(`\n🔍 Checking naveendev ↔ narender sync:`);
    if (narenderAccount) {
      const naveendevChats = await Chat.find({ account: naveendevAccount._id }).lean();
      const narenderChats = await Chat.find({ account: narenderAccount._id }).lean();
      
      const naveendevHasNarender = naveendevChats.some(c => c.spaceId === 'spaces/ilSNZCAAAAE');
      const narenderHasChat = narenderChats.some(c => c.spaceId === 'spaces/ilSNZCAAAAE');
      
      console.log(`   naveendev has narender chat: ${naveendevHasNarender ? '✅ YES' : '❌ NO'}`);
      console.log(`   narender has chat with naveendev: ${narenderHasChat ? '✅ YES' : '❌ NO'}`);
      
      if (narenderHasChat && !naveendevHasNarender) {
        console.log(`   🔧 SYNC NEEDED: Copy narender's chat to naveendev's account`);
      }
    } else {
      console.log(`   ❌ Narender account not found`);
    }
    
    console.log(`\n🔍 Checking naveendev ↔ dispatch sync:`);
    if (dispatchAccount) {
      const naveendevChats = await Chat.find({ account: naveendevAccount._id }).lean();
      const dispatchChats = await Chat.find({ account: dispatchAccount._id }).lean();
      
      const naveendevHasDispatch = naveendevChats.some(c => c.spaceId === 'spaces/w9y_pCAAAAE');
      const dispatchHasChat = dispatchChats.some(c => c.spaceId === 'spaces/w9y_pCAAAAE');
      
      console.log(`   naveendev has dispatch chat: ${naveendevHasDispatch ? '✅ YES' : '❌ NO'}`);
      console.log(`   dispatch has chat with naveendev: ${dispatchHasChat ? '✅ YES' : '❌ NO'}`);
      
      if (dispatchHasChat && !naveendevHasDispatch) {
        console.log(`   🔧 SYNC NEEDED: Copy dispatch's chat to naveendev's account`);
      }
    } else {
      console.log(`   ❌ Dispatch account not found`);
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('='.repeat(30));
    
    for (const [chatName, locations] of chatDistribution.entries()) {
      const inNaveendev = locations.find(loc => loc.account === 'naveendev@crossmilescarrier.com');
      if (!inNaveendev && locations.length > 0) {
        const sourceLocation = locations[0];
        console.log(`\n🔧 ${chatName.toUpperCase()} CHAT FIX:`);
        console.log(`   Source: ${sourceLocation.account} (${sourceLocation.messages} messages)`);
        console.log(`   Action: Copy this chat to naveendev@crossmilescarrier.com account`);
        console.log(`   Space ID: ${chatName === 'narender' ? 'spaces/ilSNZCAAAAE' : 'spaces/w9y_pCAAAAE'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugBidirectionalChats();
