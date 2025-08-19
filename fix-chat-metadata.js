const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/emailscrap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function fixChatMetadata() {
  try {
    console.log('Fixing chat metadata...\n');

    // Find all chats with missing metadata
    const chatsToFix = await Chat.find({
      $or: [
        { chatId: { $exists: false } },
        { chatId: null },
        { chatId: undefined },
        { accountEmail: { $exists: false } },
        { accountEmail: null },
        { accountEmail: undefined }
      ]
    });

    console.log(`Found ${chatsToFix.length} chats needing metadata fixes\n`);

    for (const chat of chatsToFix) {
      console.log(`Fixing chat ${chat._id}:`);
      console.log(`  Current spaceId: ${chat.spaceId}`);
      
      let updates = {};
      
      // Set chatId to spaceId if missing
      if (!chat.chatId && chat.spaceId) {
        updates.chatId = chat.spaceId;
        console.log(`  Setting chatId to: ${chat.spaceId}`);
      }

      // For the CMC space, we know it's for naveendev@crossmilescarrier.com
      // For other spaces, we'll use a default
      if (chat.spaceId === 'spaces/AAQAPUbCMD0') {
        updates.accountEmail = 'naveendev@crossmilescarrier.com';
        updates.name = 'CMC Group Chat';
        console.log(`  Setting accountEmail to: naveendev@crossmilescarrier.com (CMC space)`);
        console.log(`  Setting name to: CMC Group Chat`);
      } else if (chat.spaceId) {
        // For other spaces, try to determine from messages or use default
        updates.accountEmail = 'naveendev@crossmilescarrier.com'; // Default since this seems to be the main account
        updates.name = `Chat Space ${chat.spaceId.split('/').pop()}`;
        console.log(`  Setting accountEmail to: naveendev@crossmilescarrier.com (default)`);
        console.log(`  Setting name to: ${updates.name}`);
      }

      // Update the chat document
      if (Object.keys(updates).length > 0) {
        await Chat.findByIdAndUpdate(chat._id, updates);
        console.log(`  ✅ Updated chat ${chat._id}`);
      } else {
        console.log(`  ⚠️ No updates needed for chat ${chat._id}`);
      }
      console.log('');
    }

    // Verify the fixes
    console.log('Verifying fixes...\n');
    const fixedChats = await Chat.find();
    
    for (const chat of fixedChats) {
      console.log(`Chat ${chat._id}:`);
      console.log(`  chatId: ${chat.chatId}`);
      console.log(`  accountEmail: ${chat.accountEmail}`);
      console.log(`  name: ${chat.name}`);
      console.log(`  spaceId: ${chat.spaceId}`);
      console.log(`  Messages: ${chat.messages ? chat.messages.length : 0}`);
      
      const mediaMessages = chat.messages?.filter(msg => 
        msg.attachments && msg.attachments.length > 0) || [];
      if (mediaMessages.length > 0) {
        console.log(`  Media messages: ${mediaMessages.length}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error fixing chat metadata:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixChatMetadata();
