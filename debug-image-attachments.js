const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function debugImageAttachments() {
  try {
    console.log('🔍 DEBUGGING IMAGE ATTACHMENT DATA');
    console.log('='.repeat(50));

    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Find all messages with image attachments
    const chats = await Chat.find({
      'messages.attachments.isImage': true
    });

    console.log(`📊 Found ${chats.length} chats with image attachments:\n`);

    chats.forEach((chat, chatIndex) => {
      console.log(`${chatIndex + 1}. ${chat.displayName || '(Direct Message)'} (${chat.spaceType})`);
      console.log(`   Space ID: ${chat.spaceId}`);
      
      const imageMessages = chat.messages.filter(msg => 
        msg.attachments && msg.attachments.some(att => att.isImage)
      );
      
      imageMessages.forEach((msg, msgIndex) => {
        console.log(`   Message ${msgIndex + 1}: ${msg.messageId.split('/').pop()}`);
        console.log(`   Text: "${msg.text || '(no text)'}"`);
        
        const imageAttachments = msg.attachments.filter(att => att.isImage);
        imageAttachments.forEach((att, attIndex) => {
          console.log(`      Image ${attIndex + 1}:`);
          console.log(`         Name: ${att.name}`);
          console.log(`         LocalPath: ${att.localPath || 'NOT SET'}`);
          console.log(`         ContentType: ${att.contentType}`);
          console.log(`         DownloadStatus: ${att.downloadStatus}`);
          console.log(`         IsImage: ${att.isImage}`);
          console.log(`         FileSize: ${att.fileSize}`);
          console.log(`         URL Path: ${att.localPath ? '/api/media/files/' + att.localPath.split('/').pop() : 'NO PATH'}`);
          console.log('');
        });
      });
      console.log('');
    });

    // Also check if there are any attachments that should be images but aren't marked as such
    console.log('🔍 Checking for unmarked image attachments...\n');
    
    const allChats = await Chat.find({
      'messages.attachments.0': { $exists: true }
    });
    
    allChats.forEach((chat, chatIndex) => {
      const imageTypeMessages = chat.messages.filter(msg => 
        msg.attachments && msg.attachments.some(att => 
          att.contentType && att.contentType.includes('image') && !att.isImage
        )
      );
      
      if (imageTypeMessages.length > 0) {
        console.log(`❓ Unmarked images in ${chat.displayName || '(Direct Message)'}:`);
        imageTypeMessages.forEach((msg, msgIndex) => {
          const unmarkedImages = msg.attachments.filter(att => 
            att.contentType && att.contentType.includes('image') && !att.isImage
          );
          unmarkedImages.forEach((att, attIndex) => {
            console.log(`   - ${att.name} (${att.contentType}) - isImage: ${att.isImage}`);
          });
        });
        console.log('');
      }
    });

  } catch (error) {
    console.error('❌ Error during debug:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugImageAttachments();
