const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/emailscrap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function fixChatMetadataProperly() {
  try {
    console.log('Fixing chat metadata with proper schema fields...\n');

    // Get the account ID for naveendev@crossmilescarrier.com
    const Account = mongoose.model('Account', new mongoose.Schema({}));
    const naveenAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    if (!naveenAccount) {
      console.error('Account not found for naveendev@crossmilescarrier.com');
      return;
    }
    
    console.log(`Found account ID: ${naveenAccount._id} for naveendev@crossmilescarrier.com\n`);

    // Find all chats that need fixing
    const allChats = await Chat.find();
    console.log(`Found ${allChats.length} chats to check\n`);

    for (const chat of allChats) {
      console.log(`Fixing chat ${chat._id}:`);
      console.log(`  spaceId: ${chat.spaceId}`);;
      
      let updates = {};
      let needsUpdate = false;

      // Set account reference if missing or incorrect
      if (!chat.account || chat.account.toString() !== naveenAccount._id.toString()) {
        updates.account = naveenAccount._id;
        needsUpdate = true;
        console.log(`  Setting account to: ${naveenAccount._id}`);
      }

      // Set displayName based on space
      let displayName;
      if (chat.spaceId === 'spaces/AAQAPUbCMD0') {
        displayName = 'CMC Group Chat';
      } else {
        displayName = `Chat Space ${chat.spaceId.split('/').pop()}`;
      }
      
      if (!chat.displayName || chat.displayName !== displayName) {
        updates.displayName = displayName;
        needsUpdate = true;
        console.log(`  Setting displayName to: ${displayName}`);
      }

      // Set spaceType if missing
      if (!chat.spaceType) {
        updates.spaceType = 'SPACE'; // Default to SPACE for group chats
        needsUpdate = true;
        console.log(`  Setting spaceType to: SPACE`);
      }

      // Update messageCount
      const messageCount = chat.messages ? chat.messages.length : 0;
      if (chat.messageCount !== messageCount) {
        updates.messageCount = messageCount;
        needsUpdate = true;
        console.log(`  Setting messageCount to: ${messageCount}`);
      }

      // Set lastMessageTime
      if (chat.messages && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        if (lastMessage.createTime && (!chat.lastMessageTime || chat.lastMessageTime.getTime() !== lastMessage.createTime.getTime())) {
          updates.lastMessageTime = lastMessage.createTime;
          needsUpdate = true;
          console.log(`  Setting lastMessageTime to: ${lastMessage.createTime}`);
        }
      }

      // Apply updates
      if (needsUpdate) {
        await Chat.findByIdAndUpdate(chat._id, updates);
        console.log(`  ✅ Updated chat ${chat._id}`);
      } else {
        console.log(`  ⚠️ No updates needed for chat ${chat._id}`);
      }
      console.log('');
    }

    // Verify the fixes
    console.log('Verifying fixes...\n');
    const fixedChats = await Chat.find().populate('account');
    
    for (const chat of fixedChats) {
      console.log(`Chat ${chat._id}:`);
      console.log(`  spaceId: ${chat.spaceId}`);
      console.log(`  displayName: ${chat.displayName}`);
      console.log(`  account: ${chat.account ? chat.account.email : 'MISSING'}`);
      console.log(`  spaceType: ${chat.spaceType}`);
      console.log(`  messageCount: ${chat.messageCount}`);
      console.log(`  lastMessageTime: ${chat.lastMessageTime}`);
      
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

fixChatMetadataProperly();
