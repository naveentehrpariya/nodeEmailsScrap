const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function checkAndFixReferences() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    const chats = await Chat.find({ account: account._id });
    console.log('📊 Found', chats.length, 'chats for naveendev account');
    
    let linkedCount = 0;
    let processedChats = 0;
    
    for (const chat of chats) {
      let chatModified = false;
      let chatHasMessages = chat.messages.length > 0;
      
      if (chatHasMessages) {
        console.log('\n🔍 Processing:', chat.displayName, 'with', chat.messages.length, 'messages');
        
        // Check first few messages
        for (let i = 0; i < Math.min(chat.messages.length, 3); i++) {
          const message = chat.messages[i];
          if (message.senderId) {
            // Try to find UserMapping
            let userMapping = null;
            
            if (message.senderId.startsWith('users/')) {
              const numericId = message.senderId.split('/').pop();
              userMapping = await UserMapping.findOne({ userId: numericId });
            } else {
              userMapping = await UserMapping.findOne({ userId: message.senderId });
            }
            
            if (!userMapping && message.senderEmail) {
              userMapping = await UserMapping.findOne({ email: message.senderEmail });
            }
            
            if (userMapping) {
              const currentRef = message.sender ? message.sender.toString() : null;
              const correctRef = userMapping._id.toString();
              
              if (currentRef !== correctRef) {
                console.log('  📨 Fixing reference:', message.senderId, '->', userMapping.displayName);
                message.sender = userMapping._id;
                linkedCount++;
                chatModified = true;
              } else {
                console.log('  ✅ Reference OK:', userMapping.displayName);
              }
            } else {
              console.log('  ❌ No UserMapping for:', message.senderId, message.senderEmail || 'no email');
            }
          }
        }
      } else {
        console.log('\n⏭️ Skipping:', chat.displayName, '- no messages');
      }
      
      if (chatModified) {
        await chat.save();
        processedChats++;
        console.log('  💾 Saved chat with updated references');
      }
    }
    
    console.log('\n📊 Summary:');
    console.log('- Total chats processed:', processedChats);
    console.log('- References fixed:', linkedCount);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

checkAndFixReferences();
