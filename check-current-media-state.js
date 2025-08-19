const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function checkCurrentMediaState() {
  try {
    console.log('🌐 Connecting to CLOUD database...');
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    console.log('📊 Checking current state of ALL chats and media attachments...\n');

    // Get all chats
    const allChats = await Chat.find().sort({ updatedAt: -1 });
    console.log(`Found ${allChats.length} total chats in database\n`);

    let totalChats = 0;
    let chatsWithMedia = 0;
    let totalMediaMessages = 0;
    let totalAttachments = 0;

    for (const chat of allChats) {
      totalChats++;
      
      // Count messages with attachments
      const messagesWithAttachments = chat.messages.filter(msg => 
        msg.attachments && msg.attachments.length > 0
      );
      
      const attachmentCount = messagesWithAttachments.reduce((sum, msg) => 
        sum + (msg.attachments ? msg.attachments.length : 0), 0
      );

      if (messagesWithAttachments.length > 0) {
        chatsWithMedia++;
        totalMediaMessages += messagesWithAttachments.length;
        totalAttachments += attachmentCount;

        console.log(`📄 ${chat.displayName || 'Unnamed Chat'} (${chat.spaceId})`);
        console.log(`   _id: ${chat._id.toString()}`);
        console.log(`   Total messages: ${chat.messageCount}`);
        console.log(`   Messages with attachments: ${messagesWithAttachments.length}`);
        console.log(`   Total attachments: ${attachmentCount}`);
        console.log(`   Last updated: ${chat.updatedAt}`);
        
        // Show some example attachment details
        messagesWithAttachments.slice(0, 3).forEach((msg, i) => {
          console.log(`   📎 Message ${i+1}: ${msg.messageId.split('/').pop()}`);
          msg.attachments.forEach((att, j) => {
            console.log(`      ${j+1}. ${att.name || att.contentName || 'Unknown'} (${att.contentType}) - ${att.downloadStatus || 'unknown'}`);
          });
        });

        if (messagesWithAttachments.length > 3) {
          console.log(`   ... and ${messagesWithAttachments.length - 3} more messages with attachments`);
        }
        console.log('');
      }
    }

    console.log(`📊 OVERALL SUMMARY:`);
    console.log(`   Total chats: ${totalChats}`);
    console.log(`   Chats with media: ${chatsWithMedia}`);
    console.log(`   Messages with attachments: ${totalMediaMessages}`);
    console.log(`   Total attachments: ${totalAttachments}`);

    if (totalAttachments === 0) {
      console.log(`\n❌ NO MEDIA ATTACHMENTS FOUND IN ANY CHATS!`);
      console.log(`\n🔍 Let's check when chats were last updated:`);
      
      allChats.slice(0, 5).forEach((chat, i) => {
        console.log(`   ${i+1}. ${chat.displayName || 'Unnamed'} - Updated: ${chat.updatedAt}`);
      });

      console.log(`\n⚠️  This suggests either:`);
      console.log(`   1. Attachments were overwritten by a recent sync`);
      console.log(`   2. There's an issue with the database connection`);
      console.log(`   3. The attachment data didn't save properly`);
    } else {
      console.log(`\n✅ Found media attachments in the database`);
    }

    // Check specific chats we just worked on
    console.log(`\n🔍 Checking specific chats we just fixed:`);
    
    const cmcChat = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (cmcChat) {
      const cmcAttachments = cmcChat.messages.filter(m => m.attachments && m.attachments.length > 0).length;
      console.log(`   CMC Chat (${cmcChat._id}): ${cmcAttachments} messages with attachments`);
    } else {
      console.log(`   CMC Chat: NOT FOUND`);
    }

    const dm1Chat = await Chat.findOne({ spaceId: 'spaces/zJfRaCAAAAE' });
    if (dm1Chat) {
      const dm1Attachments = dm1Chat.messages.filter(m => m.attachments && m.attachments.length > 0).length;
      console.log(`   Direct Message 1 (${dm1Chat._id}): ${dm1Attachments} messages with attachments`);
    } else {
      console.log(`   Direct Message 1: NOT FOUND`);
    }

    const dm2Chat = await Chat.findOne({ spaceId: 'spaces/oSpG6CAAAAE' });
    if (dm2Chat) {
      const dm2Attachments = dm2Chat.messages.filter(m => m.attachments && m.attachments.length > 0).length;
      console.log(`   Direct Message 2 (${dm2Chat._id}): ${dm2Attachments} messages with attachments`);
    } else {
      console.log(`   Direct Message 2: NOT FOUND`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkCurrentMediaState();
