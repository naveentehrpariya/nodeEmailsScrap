const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function findUser10850637Chats() {
  try {
    console.log('🌐 Connecting to CLOUD database...');
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    console.log('🔍 Searching for chats with User 10850637...\n');

    // Search for chats that have messages from User 10850637
    const chatsWithUser = await Chat.find({
      $or: [
        { 'messages.senderId': { $regex: '10850637' } },
        { 'messages.senderDisplayName': { $regex: 'User 10850637' } },
        { 'messages.senderEmail': { $regex: '10850637' } }
      ]
    });

    console.log(`Found ${chatsWithUser.length} chats with User 10850637\n`);

    if (chatsWithUser.length === 0) {
      console.log('❌ No chats found with User 10850637');
      
      // Let's also search more broadly
      console.log('\n🔍 Searching for any messages with "10850637"...');
      const anyChatsWithNumber = await Chat.find({
        'messages.senderId': { $regex: '10850637' }
      });
      console.log(`Found ${anyChatsWithNumber.length} chats with senderId containing 10850637`);
      
      return;
    }

    // Analyze each chat
    chatsWithUser.forEach((chat, i) => {
      console.log(`📄 Chat ${i + 1}:`);
      console.log(`   _id: ${chat._id.toString()}`);
      console.log(`   spaceId: ${chat.spaceId}`);
      console.log(`   displayName: ${chat.displayName}`);
      console.log(`   messageCount: ${chat.messageCount}`);

      // Find messages from User 10850637
      const user10850637Messages = chat.messages.filter(msg => 
        msg.senderId.includes('10850637') || 
        msg.senderDisplayName.includes('User 10850637') ||
        msg.senderEmail.includes('10850637')
      );

      console.log(`   Messages from User 10850637: ${user10850637Messages.length}`);

      // Check attachment status for these messages
      let messagesWithAttachments = 0;
      let messagesWithoutAttachments = 0;
      let totalAttachments = 0;

      user10850637Messages.forEach((msg, j) => {
        const attachmentCount = msg.attachments ? msg.attachments.length : 0;
        if (attachmentCount > 0) {
          messagesWithAttachments++;
          totalAttachments += attachmentCount;
        } else {
          messagesWithoutAttachments++;
        }

        if (j < 3) { // Show first 3 messages as examples
          console.log(`      ${j + 1}. ${msg.messageId.split('/').pop()} - "${(msg.text || '(no text)').substring(0, 30)}..." - ${attachmentCount} attachments`);
        }
      });

      if (user10850637Messages.length > 3) {
        console.log(`      ... and ${user10850637Messages.length - 3} more messages from User 10850637`);
      }

      console.log(`   📊 Attachment summary for User 10850637:`);
      console.log(`      Messages with attachments: ${messagesWithAttachments}`);
      console.log(`      Messages without attachments: ${messagesWithoutAttachments}`);
      console.log(`      Total attachments: ${totalAttachments}`);

      if (messagesWithoutAttachments > 0 && totalAttachments === 0) {
        console.log(`   ⚠️  This chat might be missing attachment data!`);
      } else if (totalAttachments > 0) {
        console.log(`   ✅ This chat has attachment data`);
      }

      console.log('');
    });

    // Summary
    const totalUser10850637Messages = chatsWithUser.reduce((sum, chat) => {
      return sum + chat.messages.filter(msg => 
        msg.senderId.includes('10850637') || 
        msg.senderDisplayName.includes('User 10850637') ||
        msg.senderEmail.includes('10850637')
      ).length;
    }, 0);

    const totalAttachmentsFromUser = chatsWithUser.reduce((sum, chat) => {
      return sum + chat.messages
        .filter(msg => 
          msg.senderId.includes('10850637') || 
          msg.senderDisplayName.includes('User 10850637') ||
          msg.senderEmail.includes('10850637')
        )
        .reduce((msgSum, msg) => msgSum + (msg.attachments ? msg.attachments.length : 0), 0);
    }, 0);

    console.log(`📊 Overall Summary for User 10850637:`);
    console.log(`   Total messages from User 10850637: ${totalUser10850637Messages}`);
    console.log(`   Total attachments from User 10850637: ${totalAttachmentsFromUser}`);

    if (totalAttachmentsFromUser === 0 && totalUser10850637Messages > 0) {
      console.log(`\n⚠️  User 10850637 has ${totalUser10850637Messages} messages but 0 attachments - likely missing attachment data!`);
      
      // List the spaces that might need fixing
      console.log(`\n🔧 Spaces that might need attachment fixes:`);
      chatsWithUser.forEach(chat => {
        const user10850637MessageCount = chat.messages.filter(msg => 
          msg.senderId.includes('10850637') || 
          msg.senderDisplayName.includes('User 10850637') ||
          msg.senderEmail.includes('10850637')
        ).length;
        
        if (user10850637MessageCount > 0) {
          console.log(`   - ${chat.spaceId} (${chat.displayName}) - ${user10850637MessageCount} messages from User 10850637`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

findUser10850637Chats();
