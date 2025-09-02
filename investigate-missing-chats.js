const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function investigateMissingChats() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    const chats = await Chat.find({ account: account._id }).lean();
    console.log(`📊 Found ${chats.length} chats for naveendev account`);
    
    console.log('\n🔍 Searching for chats with "dispatch" and "narender":');
    console.log('='.repeat(60));
    
    // Search for dispatch chats
    console.log('\n📧 DISPATCH CHATS:');
    const dispatchChats = chats.filter(chat => {
      // Check chat display name
      if (chat.displayName && chat.displayName.toLowerCase().includes('dispatch')) {
        return true;
      }
      
      // Check message senders
      return chat.messages.some(message => 
        (message.senderEmail && message.senderEmail.toLowerCase().includes('dispatch')) ||
        (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('dispatch'))
      );
    });
    
    if (dispatchChats.length > 0) {
      dispatchChats.forEach((chat, index) => {
        console.log(`  Dispatch Chat ${index + 1}:`);
        console.log(`    - Display Name: ${chat.displayName}`);
        console.log(`    - Space Type: ${chat.spaceType}`);
        console.log(`    - Space ID: ${chat.spaceId}`);
        console.log(`    - Messages: ${chat.messages.length}`);
        
        // Show sender details
        const senders = new Map();
        chat.messages.forEach(msg => {
          if (msg.senderId) {
            senders.set(msg.senderId, {
              email: msg.senderEmail,
              displayName: msg.senderDisplayName,
              isCurrentUser: msg.isSentByCurrentUser
            });
          }
        });
        
        console.log(`    - Participants:`);
        for (const [senderId, info] of senders.entries()) {
          console.log(`      • ${senderId}: ${info.displayName || 'no name'} (${info.email || 'no email'})${info.isCurrentUser ? ' [CURRENT USER]' : ''}`);
        }
        console.log('');
      });
    } else {
      console.log('  ❌ No dispatch chats found in database');
    }
    
    // Search for narender chats
    console.log('\n👤 NARENDER CHATS:');
    const narenderChats = chats.filter(chat => {
      // Check chat display name
      if (chat.displayName && chat.displayName.toLowerCase().includes('narender')) {
        return true;
      }
      
      // Check message senders
      return chat.messages.some(message => 
        (message.senderEmail && message.senderEmail.toLowerCase().includes('narender')) ||
        (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('narender'))
      );
    });
    
    if (narenderChats.length > 0) {
      narenderChats.forEach((chat, index) => {
        console.log(`  Narender Chat ${index + 1}:`);
        console.log(`    - Display Name: ${chat.displayName}`);
        console.log(`    - Space Type: ${chat.spaceType}`);
        console.log(`    - Space ID: ${chat.spaceId}`);
        console.log(`    - Messages: ${chat.messages.length}`);
        
        // Show sender details
        const senders = new Map();
        chat.messages.forEach(msg => {
          if (msg.senderId) {
            senders.set(msg.senderId, {
              email: msg.senderEmail,
              displayName: msg.senderDisplayName,
              isCurrentUser: msg.isSentByCurrentUser
            });
          }
        });
        
        console.log(`    - Participants:`);
        for (const [senderId, info] of senders.entries()) {
          console.log(`      • ${senderId}: ${info.displayName || 'no name'} (${info.email || 'no email'})${info.isCurrentUser ? ' [CURRENT USER]' : ''}`);
        }
        console.log('');
      });
    } else {
      console.log('  ❌ No narender chats found in database');
    }
    
    // Search in UserMappings for these users
    console.log('\n🔍 CHECKING USER MAPPINGS:');
    const dispatchMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'dispatch', $options: 'i' } },
        { displayName: { $regex: 'dispatch', $options: 'i' } }
      ]
    }).lean();
    
    const narenderMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'narender', $options: 'i' } },
        { displayName: { $regex: 'narender', $options: 'i' } }
      ]
    }).lean();
    
    console.log(`📧 Dispatch UserMappings: ${dispatchMappings.length}`);
    dispatchMappings.forEach(mapping => {
      console.log(`    - ${mapping.userId}: ${mapping.displayName} (${mapping.email})`);
    });
    
    console.log(`👤 Narender UserMappings: ${narenderMappings.length}`);
    narenderMappings.forEach(mapping => {
      console.log(`    - ${mapping.userId}: ${mapping.displayName} (${mapping.email})`);
    });
    
    // Check all chat participants and senders for broader search
    console.log('\n🔍 BROAD SEARCH IN ALL CHATS:');
    let foundDispatch = false;
    let foundNarender = false;
    
    chats.forEach(chat => {
      chat.messages.forEach(message => {
        const email = (message.senderEmail || '').toLowerCase();
        const name = (message.senderDisplayName || '').toLowerCase();
        
        if (email.includes('dispatch') || name.includes('dispatch')) {
          if (!foundDispatch) {
            console.log('📧 Found dispatch-related message:');
            foundDispatch = true;
          }
          console.log(`    Chat: ${chat.displayName} | Sender: ${message.senderDisplayName} (${message.senderEmail})`);
        }
        
        if (email.includes('narender') || name.includes('narender')) {
          if (!foundNarender) {
            console.log('👤 Found narender-related message:');
            foundNarender = true;
          }
          console.log(`    Chat: ${chat.displayName} | Sender: ${message.senderDisplayName} (${message.senderEmail})`);
        }
      });
    });
    
    if (!foundDispatch && !foundNarender) {
      console.log('❌ No dispatch or narender related content found in any chats');
    }
    
    // Check if they might be in empty chats or other account
    console.log('\n🔍 CHECKING EMPTY CHATS AND OTHER POSSIBILITIES:');
    const emptyChats = chats.filter(chat => chat.messages.length === 0);
    console.log(`📭 Empty chats: ${emptyChats.length}`);
    emptyChats.forEach((chat, index) => {
      console.log(`  Empty Chat ${index + 1}: ${chat.displayName} (${chat.spaceId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

investigateMissingChats();
