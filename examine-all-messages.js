const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function examineAllMessages() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails');
    console.log('✅ Connected to MongoDB Atlas');
    
    console.log('\n🔍 EXAMINING ALL MESSAGES IN BOTH ACCOUNTS:');
    console.log('='.repeat(60));
    
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const narenderAccount = await Account.findOne({ email: 'narender@crossmilescarrier.com' });
    const dispatchAccount = await Account.findOne({ email: 'dispatch@crossmilescarrier.com' });
    
    const spacesToExamine = [
      {
        name: 'Narender',
        spaceId: 'spaces/ilSNZCAAAAE',
        accounts: [
          { name: 'naveendev', account: naveendevAccount },
          { name: 'narender', account: narenderAccount }
        ]
      },
      {
        name: 'Dispatch', 
        spaceId: 'spaces/w9y_pCAAAAE',
        accounts: [
          { name: 'naveendev', account: naveendevAccount },
          { name: 'dispatch', account: dispatchAccount }
        ]
      }
    ];
    
    for (const spaceInfo of spacesToExamine) {
      console.log(`\n📝 EXAMINING ${spaceInfo.name.toUpperCase()} CHAT (${spaceInfo.spaceId}):`);
      console.log('='.repeat(50));
      
      for (const { name, account } of spaceInfo.accounts) {
        if (!account) {
          console.log(`   ❌ ${name} account not found`);
          continue;
        }
        
        const chat = await Chat.findOne({ 
          spaceId: spaceInfo.spaceId, 
          account: account._id 
        }).lean();
        
        if (!chat) {
          console.log(`   ❌ Chat not found in ${name} account`);
          continue;
        }
        
        console.log(`\n👤 ${name.toUpperCase()} ACCOUNT VIEW:`);
        console.log(`   📧 Account: ${account.email}`);
        console.log(`   📝 Chat: ${chat.displayName}`);
        console.log(`   📨 Messages: ${chat.messages.length}`);
        
        if (chat.messages.length > 0) {
          console.log(`   💬 All messages:`);
          chat.messages.forEach((msg, index) => {
            console.log(`      ${index + 1}. "${msg.text}"`);
            console.log(`         From: ${msg.senderDisplayName || 'Unknown'} (${msg.senderEmail || 'no email'})`);
            console.log(`         Sender ID: ${msg.senderId}`);
            console.log(`         Is Current User: ${msg.isSentByCurrentUser}`);
            console.log(`         Time: ${msg.createTime}`);
            console.log('');\n          });\n        } else {\n          console.log('   📭 No messages found');\n        }\n      }\n    }\n    \n    // Now let's check what the issue actually is\n    console.log('\\n🔍 ANALYZING THE REAL ISSUE:');\n    console.log('='.repeat(40));\n    \n    // Check if the problem is that messages exist but are all from naveendev\n    for (const spaceInfo of spacesToExamine) {\n      console.log(`\\n📝 ${spaceInfo.name} Chat Analysis:`);\n      \n      const naveendevChat = await Chat.findOne({ \n        spaceId: spaceInfo.spaceId, \n        account: naveendevAccount._id \n      }).lean();\n      \n      if (naveendevChat) {\n        const senders = new Set();\n        naveendevChat.messages.forEach(msg => {\n          senders.add(`${msg.senderDisplayName || 'Unknown'} (${msg.senderEmail || 'no email'})`);\n        });\n        \n        console.log(`   👥 Unique senders in naveendev's view: ${senders.size}`);\n        for (const sender of senders) {\n          console.log(`      - ${sender}`);\n        }\n        \n        if (senders.size === 1 && naveendevChat.messages[0]?.senderEmail === 'naveendev@crossmilescarrier.com') {\n          console.log(`   ❌ PROBLEM IDENTIFIED: Only naveendev's messages exist!`);\n          console.log(`   💡 Solution: Need to add messages FROM ${spaceInfo.name} TO naveendev`);\n          \n          // Suggest what messages should exist\n          const expectedOtherEmail = spaceInfo.name === 'Narender' ? 'narender@crossmilescarrier.com' : 'dispatch@crossmilescarrier.com';\n          console.log(`   📝 Expected messages from: ${expectedOtherEmail}`);\n          \n          // Show that we need to CREATE these messages\n          console.log(`   🔧 Action needed: Create reply messages from ${spaceInfo.name}`);\n        } else {\n          console.log(`   ✅ Chat has multiple participants`);\n        }\n      }\n    }\n    \n    // Final recommendation\n    console.log('\\n💡 FINAL DIAGNOSIS:');\n    console.log('='.repeat(30));\n    console.log('The issue is that the conversations are ONE-WAY:');\n    console.log('- Naveendev sent messages TO narender and dispatch');\n    console.log('- But narender and dispatch never REPLIED');\n    console.log('- So their chats only show naveendev\\'s messages');\n    console.log('- This makes the API filter them out (no \"other participant\")');\n    console.log('');\n    console.log('SOLUTIONS:');\n    console.log('1. 📝 Add reply messages from narender/dispatch');\n    console.log('2. 🔧 Modify filtering logic to show one-way conversations');\n    console.log('3. 👥 Use participant data instead of message senders');\n    \n  } catch (error) {\n    console.error('❌ Error:', error.message);\n  } finally {\n    mongoose.disconnect();\n    console.log('🔌 Disconnected from MongoDB Atlas');\n  }\n}\n\nexamineAllMessages();"}}
</function_results>

<function_calls>
<invoke name="run_command">
<parameter name="command">node examine-all-messages.js
