const mongoose = require('mongoose');
const Chat = require('./db/Chat');

async function findAllCMCChats() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    
    console.log('🔍 Searching for ALL CMC chat documents...\n');
    
    // Find chats with CMC spaceId
    const cmcChats = await Chat.find({ spaceId: 'spaces/AAQAPUbCMD0' });
    console.log(`Total CMC chats found: ${cmcChats.length}\n`);
    
    if (cmcChats.length === 0) {
      console.log('❌ No CMC chats found with spaceId spaces/AAQAPUbCMD0');
      
      // Try to find by name
      const chatsWithCMC = await Chat.find({ 
        $or: [
          { displayName: /CMC/i }, 
          { name: /CMC/i }
        ] 
      });
      console.log(`\nChats with CMC in name: ${chatsWithCMC.length}`);
      chatsWithCMC.forEach(chat => {
        console.log(`   ${chat._id.toString()} - ${chat.displayName} - ${chat.spaceId}`);
      });
    } else {
      cmcChats.forEach((chat, i) => {
        console.log(`📄 CMC Chat ${i+1}:`);
        console.log(`   _id: ${chat._id.toString()}`);
        console.log(`   account: ${chat.account.toString()}`);
        console.log(`   displayName: ${chat.displayName}`);
        console.log(`   messageCount: ${chat.messageCount}`);
        console.log(`   createdAt: ${chat.createdAt}`);
        console.log(`   updatedAt: ${chat.updatedAt}`);
        
        const msgsWithAttachments = chat.messages.filter(m => 
          m.attachments && m.attachments.length > 0
        );
        console.log(`   Messages with attachments: ${msgsWithAttachments.length}/${chat.messageCount}`);
        
        if (msgsWithAttachments.length > 0) {
          console.log('   ✅ HAS ATTACHMENTS');
          msgsWithAttachments.forEach((msg, j) => {
            console.log(`      ${j+1}. ${msg.messageId.split('/').pop()}: ${msg.attachments.length} attachments`);
          });
        } else {
          console.log('   ❌ NO ATTACHMENTS');
        }
        console.log('');
      });
    }

    // Also check if the specific ID from the screenshot exists
    const screenshotChatId = '68a19f2f2e992c669dc08890';
    console.log(`\n🔍 Checking for chat from screenshot: ${screenshotChatId}`);
    try {
      const screenshotChat = await Chat.findById(screenshotChatId);
      if (screenshotChat) {
        console.log(`✅ Found chat from screenshot:`);
        console.log(`   spaceId: ${screenshotChat.spaceId}`);
        console.log(`   displayName: ${screenshotChat.displayName}`);
        console.log(`   messageCount: ${screenshotChat.messageCount}`);
        console.log(`   account: ${screenshotChat.account.toString()}`);
        const attachmentCounts = screenshotChat.messages.map(m => m.attachments ? m.attachments.length : 0);
        console.log(`   Attachments per message: ${attachmentCounts}`);
      } else {
        console.log(`❌ Chat from screenshot NOT FOUND`);
      }
    } catch (error) {
      console.log(`❌ Error checking screenshot chat: ${error.message}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

findAllCMCChats();
