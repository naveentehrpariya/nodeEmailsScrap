const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function checkCloudCMCChat() {
  try {
    console.log('🌐 Connecting to cloud MongoDB Atlas database...');
    console.log('Database:', CLOUD_DB_URL);
    
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to cloud database\n');
    
    console.log('🔍 Searching for CMC chat in CLOUD database...');
    
    // Find CMC chats
    const cmcChats = await Chat.find({ spaceId: 'spaces/AAQAPUbCMD0' });
    console.log(`\nFound ${cmcChats.length} CMC chats in cloud database\n`);
    
    if (cmcChats.length === 0) {
      console.log('❌ No CMC chats found in cloud database');
      
      // Check for any chats at all
      const totalChats = await Chat.countDocuments();
      console.log(`Total chats in cloud database: ${totalChats}`);
      
      if (totalChats > 0) {
        console.log('\nFirst 5 chats in cloud database:');
        const sampleChats = await Chat.find().limit(5);
        sampleChats.forEach((chat, i) => {
          console.log(`  ${i+1}. ${chat._id.toString()} - ${chat.displayName || 'No name'} - ${chat.spaceId || 'No spaceId'}`);
        });
      }
      
      // Check if the screenshot chat exists
      const screenshotChatId = '68a19f2f2e992c669dc08890';
      console.log(`\n🔍 Checking for screenshot chat ID in cloud: ${screenshotChatId}`);
      try {
        const screenshotChat = await Chat.findById(screenshotChatId);
        if (screenshotChat) {
          console.log('✅ Found screenshot chat in CLOUD database:');
          console.log(`   spaceId: ${screenshotChat.spaceId}`);
          console.log(`   displayName: ${screenshotChat.displayName}`);
          console.log(`   messageCount: ${screenshotChat.messageCount}`);
          const attachmentCounts = screenshotChat.messages.map(m => m.attachments ? m.attachments.length : 0);
          console.log(`   Attachments per message: [${attachmentCounts.join(', ')}]`);
          
          if (screenshotChat.spaceId === 'spaces/AAQAPUbCMD0') {
            console.log('   🎯 This IS the CMC chat you\'re looking at!');
            console.log('   📊 Messages in this chat:');
            screenshotChat.messages.forEach((msg, i) => {
              console.log(`      ${i+1}. ${msg.messageId.split('/').pop()} - "${(msg.text || '(no text)').substring(0, 30)}..." - ${msg.attachments ? msg.attachments.length : 0} attachments`);
            });
          }
        } else {
          console.log('❌ Screenshot chat NOT found in cloud database either');
        }
      } catch (error) {
        console.log(`❌ Error checking screenshot chat: ${error.message}`);
      }
      
    } else {
      // Found CMC chats in cloud
      cmcChats.forEach((chat, i) => {
        console.log(`📄 CMC Chat ${i+1} in CLOUD:`);
        console.log(`   _id: ${chat._id.toString()}`);
        console.log(`   account: ${chat.account ? chat.account.toString() : 'undefined'}`);
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
            msg.attachments.forEach((att, k) => {
              console.log(`         - ${att.name || att.contentName || 'Unknown'} (${att.contentType})`);
            });
          });
        } else {
          console.log('   ❌ NO ATTACHMENTS');
          console.log('   📋 Messages:');
          chat.messages.forEach((msg, j) => {
            console.log(`      ${j+1}. ${msg.messageId.split('/').pop()} - "${(msg.text || '(no text)').substring(0, 30)}..." - ${msg.attachments ? msg.attachments.length : 0} attachments`);
          });
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error connecting to cloud database:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkCloudCMCChat();
