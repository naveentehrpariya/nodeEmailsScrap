const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/emailscrap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkChatMetadata() {
  try {
    console.log('Checking chat metadata...\n');

    // Find all chats
    const allChats = await Chat.find();
    console.log(`Found ${allChats.length} total chats\n`);

    for (const chat of allChats) {
      console.log(`Chat Document:`);
      console.log(`  MongoDB _id: ${chat._id}`);
      console.log(`  chatId: ${chat.chatId || 'UNDEFINED'}`);
      console.log(`  name: ${chat.name || 'UNDEFINED'}`);
      console.log(`  accountEmail: ${chat.accountEmail || 'UNDEFINED'}`);
      console.log(`  spaceId: ${chat.spaceId || 'UNDEFINED'}`);
      console.log(`  Messages count: ${chat.messages ? chat.messages.length : 0}`);
      
      // Check for media messages
      const mediaMessages = chat.messages?.filter(msg => 
        msg.attachments && msg.attachments.length > 0) || [];
      
      if (mediaMessages.length > 0) {
        console.log(`  Media messages: ${mediaMessages.length}`);
        console.log(`    Sample media message IDs: ${mediaMessages.slice(0, 3).map(m => m.messageId).join(', ')}`);
      }
      console.log('');
    }

    // Check for chats missing critical fields
    const chatsWithMissingData = await Chat.find({
      $or: [
        { chatId: { $exists: false } },
        { chatId: null },
        { chatId: undefined },
        { accountEmail: { $exists: false } },
        { accountEmail: null },
        { accountEmail: undefined }
      ]
    });

    console.log(`\nChats with missing chatId or accountEmail: ${chatsWithMissingData.length}`);
    
    if (chatsWithMissingData.length > 0) {
      console.log('\nChats needing repair:');
      for (const chat of chatsWithMissingData) {
        console.log(`  Chat _id: ${chat._id}`);
        console.log(`    Missing chatId: ${!chat.chatId}`);
        console.log(`    Missing accountEmail: ${!chat.accountEmail}`);
        
        // Try to extract from messages
        if (chat.messages && chat.messages.length > 0) {
          const sampleMessage = chat.messages[0];
          console.log(`    Sample message ID: ${sampleMessage.messageId}`);
          
          // Extract space ID from message
          if (sampleMessage.messageId) {
            const spaceMatch = sampleMessage.messageId.match(/spaces\/([^\/]+)/);
            if (spaceMatch) {
              console.log(`    Can extract spaceId: ${spaceMatch[1]}`);
            }
          }
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error('Error checking chat metadata:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkChatMetadata();
