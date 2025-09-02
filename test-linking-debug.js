const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function testLinkingDebug() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    console.log('🔗 Starting to link existing chats to UserMapping references...');
    
    // Get all chats
    const chats = await Chat.find({});
    console.log(`📊 Found ${chats.length} total chats in database`);
    
    // Debug: Show chat details
    chats.forEach((chat, index) => {
      console.log(`  Chat ${index + 1}: ${chat.displayName} - ${chat.messages.length} messages`);
    });
    
    let linkedMessagesCount = 0;
    let linkedParticipantsCount = 0;
    let processedChatsCount = 0;
    
    for (const chat of chats) {
      let chatModified = false;
      console.log(`\n🔍 Processing chat: ${chat.displayName} with ${chat.messages.length} messages`);
      
      // Link message senders to UserMapping
      for (const message of chat.messages) {
        console.log(`  📨 Message: senderId=${message.senderId}, sender=${message.sender}, typeof=${typeof message.sender}`);
        console.log(`    Condition check: senderId exists=${!!message.senderId}, sender==null=${message.sender == null}, sender==undefined=${message.sender == undefined}`);
        
        if (message.senderId && (message.sender == null || message.sender == undefined)) {
          console.log(`    ✅ Message meets linking criteria, searching for UserMapping...`);
          try {
            const senderMapping = await UserMapping.findOne({
              $or: [
                { userId: message.senderId },
                { email: message.senderEmail },
                { userId: message.senderId.split('/').pop() } // Handle users/123 vs 123 format
              ]
            });
            
            if (senderMapping) {
              // Don't actually modify, just log what would happen
              linkedMessagesCount++;
              console.log(`    ✅ WOULD LINK message sender ${message.senderId} -> ${senderMapping.displayName}`);
            } else {
              console.log(`    ❌ No UserMapping found for ${message.senderId} (${message.senderEmail})`);
            }
          } catch (error) {
            console.warn(`    ❌ Failed to search for message sender ${message.senderId}:`, error.message);
          }
        } else {
          console.log(`    ⏭️ Message doesn't meet criteria or already linked`);
        }
      }
      
      if (chat.messages.length > 0) {
        processedChatsCount++;
      }
    }
    
    console.log('\n✅ Debug run completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Total chats with messages: ${processedChatsCount}`);
    console.log(`   - Messages that would be linked: ${linkedMessagesCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

testLinkingDebug();
