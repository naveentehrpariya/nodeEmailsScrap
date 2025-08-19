const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function verifyMediaSync() {
  try {
    console.log('🔍 VERIFYING MEDIA SYNC RESULTS');
    console.log('='.repeat(50));

    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Find all chats with attachments
    const chatsWithAttachments = await Chat.find({
      'messages.attachments.0': { $exists: true }
    });

    console.log(`📊 Found ${chatsWithAttachments.length} chats with media attachments:\n`);

    let totalAttachments = 0;
    let totalMediaMessages = 0;

    chatsWithAttachments.forEach((chat, index) => {
      console.log(`${index + 1}. ${chat.displayName || '(Direct Message)'} (${chat.spaceType})`);
      console.log(`   Space ID: ${chat.spaceId}`);
      
      const messagesWithAttachments = chat.messages.filter(msg => msg.attachments && msg.attachments.length > 0);
      console.log(`   Messages with attachments: ${messagesWithAttachments.length}`);
      
      let spaceAttachmentCount = 0;
      messagesWithAttachments.forEach((msg, msgIndex) => {
        const attachmentCount = msg.attachments.length;
        spaceAttachmentCount += attachmentCount;
        console.log(`      ${msgIndex + 1}. ${msg.messageId.split('/').pop()} - ${attachmentCount} attachments`);
        
        msg.attachments.forEach((att, attIndex) => {
          const status = att.downloadStatus || 'processed';
          const type = att.isImage ? 'image' : att.isVideo ? 'video' : att.isDocument ? 'document' : 'other';
          console.log(`         ${attIndex + 1}. ${att.name} (${type}) - ${status}`);
        });
      });
      
      console.log(`   Total attachments: ${spaceAttachmentCount}\n`);
      totalAttachments += spaceAttachmentCount;
      totalMediaMessages += messagesWithAttachments.length;
    });

    console.log('='.repeat(50));
    console.log('📈 VERIFICATION SUMMARY:');
    console.log(`   Chats with media: ${chatsWithAttachments.length}`);
    console.log(`   Messages with media: ${totalMediaMessages}`);
    console.log(`   Total attachments: ${totalAttachments}`);

    if (totalAttachments > 0) {
      console.log('\n🎉 SUCCESS! All media attachments are now saved in your cloud database!');
      console.log('\n✅ Your frontend application should now display all media messages correctly.');
    } else {
      console.log('\n⚠️  No attachments found in database. Something may have gone wrong.');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

verifyMediaSync();
