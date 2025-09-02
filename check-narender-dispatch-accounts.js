const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function checkNarenderDispatchAccounts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    console.log('\n🔍 CHECKING NARENDER AND DISPATCH ACCOUNTS FOR CHATS WITH NAVEENDEV:');
    console.log('='.repeat(70));
    
    // Find all accounts that might be narender or dispatch
    const allAccounts = await Account.find({}).lean();
    console.log(`📊 Found ${allAccounts.length} total accounts`);
    
    let narenderAccount = null;
    let dispatchAccount = null;
    
    // Look for narender and dispatch accounts
    for (const account of allAccounts) {
      console.log(`📧 Account: ${account.email}`);
      
      if (account.email.toLowerCase().includes('narender')) {
        narenderAccount = account;
        console.log(`   🎯 NARENDER ACCOUNT FOUND: ${account.email}`);
      }
      
      if (account.email.toLowerCase().includes('dispatch')) {
        dispatchAccount = account;
        console.log(`   🎯 DISPATCH ACCOUNT FOUND: ${account.email}`);
      }
    }
    
    // Check narender account chats
    if (narenderAccount) {
      console.log(`\n👤 EXAMINING NARENDER ACCOUNT (${narenderAccount.email}):`);
      console.log('='.repeat(50));
      
      const narenderChats = await Chat.find({ account: narenderAccount._id }).lean();
      console.log(`📝 Found ${narenderChats.length} chats in narender account`);
      
      // Look for chats with naveendev
      let foundNaveenChat = false;
      
      for (const chat of narenderChats) {
        console.log(`\n📝 Chat: ${chat.displayName} (${chat.spaceType}) - ${chat.messages.length} messages`);
        
        // Check if this chat involves naveendev
        let hasNaveendev = false;
        let naveendevMessages = 0;
        const participants = new Set();
        
        for (const message of chat.messages) {
          if (message.senderEmail) {
            participants.add(message.senderEmail);
            
            if (message.senderEmail.toLowerCase().includes('naveendev') || 
                message.senderEmail === 'naveendev@crossmilescarrier.com') {
              hasNaveendev = true;
              naveendevMessages++;
            }
          }
          
          if (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('naveen')) {
            hasNaveendev = true;
            naveendevMessages++;
          }
        }
        
        console.log(`   👥 Participants: ${Array.from(participants).join(', ')}`);
        console.log(`   📨 Has naveendev: ${hasNaveendev ? 'YES' : 'NO'} (${naveendevMessages} messages)`);
        
        if (hasNaveendev) {
          foundNaveenChat = true;
          console.log(`   🎯 FOUND CHAT WITH NAVEENDEV!`);
          console.log(`   📋 Details:`);
          console.log(`      - Space ID: ${chat.spaceId}`);
          console.log(`      - Space Type: ${chat.spaceType}`);
          console.log(`      - Total Messages: ${chat.messages.length}`);
          console.log(`      - Last Message Time: ${chat.lastMessageTime}`);
          
          // Show recent messages
          const recentMessages = chat.messages.slice(-3);
          console.log(`   💬 Recent messages:`);
          recentMessages.forEach(msg => {
            console.log(`      "${msg.text}" - ${msg.senderDisplayName} (${msg.senderEmail})`);
          });
        }
      }
      
      if (!foundNaveenChat) {
        console.log('❌ No chats with naveendev found in narender account');
      }
      
    } else {
      console.log('\n❌ NARENDER ACCOUNT NOT FOUND');
      
      // Try to find accounts with variations
      console.log('🔍 Looking for accounts with narender variations...');
      const narenderVariations = allAccounts.filter(account => {
        const email = account.email.toLowerCase();
        return email.includes('naren') || email.includes('narender') || 
               (account.name && account.name.toLowerCase().includes('narender'));
      });
      
      console.log(`Found ${narenderVariations.length} potential matches:`);
      narenderVariations.forEach(account => {
        console.log(`   - ${account.email} (${account.name || 'no name'})`);
      });
    }
    
    // Check dispatch account chats
    if (dispatchAccount) {
      console.log(`\n📧 EXAMINING DISPATCH ACCOUNT (${dispatchAccount.email}):`);
      console.log('='.repeat(50));
      
      const dispatchChats = await Chat.find({ account: dispatchAccount._id }).lean();
      console.log(`📝 Found ${dispatchChats.length} chats in dispatch account`);
      
      // Look for chats with naveendev
      let foundNaveenChat = false;
      
      for (const chat of dispatchChats) {
        console.log(`\n📝 Chat: ${chat.displayName} (${chat.spaceType}) - ${chat.messages.length} messages`);
        
        // Check if this chat involves naveendev
        let hasNaveendev = false;
        let naveendevMessages = 0;
        const participants = new Set();
        
        for (const message of chat.messages) {
          if (message.senderEmail) {
            participants.add(message.senderEmail);
            
            if (message.senderEmail.toLowerCase().includes('naveendev') || 
                message.senderEmail === 'naveendev@crossmilescarrier.com') {
              hasNaveendev = true;
              naveendevMessages++;
            }
          }
          
          if (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('naveen')) {
            hasNaveendev = true;
            naveendevMessages++;
          }
        }
        
        console.log(`   👥 Participants: ${Array.from(participants).join(', ')}`);
        console.log(`   📨 Has naveendev: ${hasNaveendev ? 'YES' : 'NO'} (${naveendevMessages} messages)`);
        
        if (hasNaveendev) {
          foundNaveenChat = true;
          console.log(`   🎯 FOUND CHAT WITH NAVEENDEV!`);
          console.log(`   📋 Details:`);
          console.log(`      - Space ID: ${chat.spaceId}`);
          console.log(`      - Space Type: ${chat.spaceType}`);
          console.log(`      - Total Messages: ${chat.messages.length}`);
          console.log(`      - Last Message Time: ${chat.lastMessageTime}`);
          
          // Show recent messages
          const recentMessages = chat.messages.slice(-3);
          console.log(`   💬 Recent messages:`);
          recentMessages.forEach(msg => {
            console.log(`      "${msg.text}" - ${msg.senderDisplayName} (${msg.senderEmail})`);
          });
        }
      }
      
      if (!foundNaveenChat) {
        console.log('❌ No chats with naveendev found in dispatch account');
      }
      
    } else {
      console.log('\n❌ DISPATCH ACCOUNT NOT FOUND');
      console.log('   Available accounts:');
      allAccounts.forEach(account => {
        console.log(`   - ${account.email}`);
      });
    }
    
    // Now check if we need to sync these missing chats to naveendev account
    console.log('\n🔄 BIDIRECTIONAL SYNC ANALYSIS:');
    console.log('='.repeat(40));
    
    if (narenderAccount || dispatchAccount) {
      console.log('💡 ISSUE IDENTIFIED: Bidirectional Chat Sync Problem');
      console.log('');
      console.log('The problem is that Google Chat API may return different chat lists');
      console.log('for different users in the same conversation. This can happen when:');
      console.log('- One user initiated the chat');
      console.log('- There are permission differences');
      console.log('- Chat history access varies by user');
      console.log('');
      console.log('🔧 SOLUTION: We need to sync chats from narender/dispatch accounts');
      console.log('and then create corresponding entries in naveendev account.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

checkNarenderDispatchAccounts();
