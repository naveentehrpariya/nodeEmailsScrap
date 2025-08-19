const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/emailscrap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkDatabaseAttachments() {
  try {
    console.log('Checking database for messages with attachments...\n');

    // Find all chats with messages that have attachments
    const chatsWithAttachments = await Chat.find({
      'messages.attachments': { $exists: true, $ne: [] }
    });

    console.log(`Found ${chatsWithAttachments.length} chats with attachment messages\n`);

    for (const chat of chatsWithAttachments) {
      console.log(`Chat ID: ${chat.chatId}`);
      console.log(`Chat Name: ${chat.name || 'No name'}`);
      console.log(`Account: ${chat.accountEmail}`);
      
      const messagesWithAttachments = chat.messages.filter(msg => 
        msg.attachments && msg.attachments.length > 0
      );
      
      console.log(`Messages with attachments: ${messagesWithAttachments.length}\n`);
      
      for (let i = 0; i < Math.min(messagesWithAttachments.length, 3); i++) {
        const msg = messagesWithAttachments[i];
        console.log(`  Message ${i + 1}:`);
        console.log(`    Message ID: ${msg.messageId}`);
        console.log(`    Text: ${(msg.text || '').substring(0, 50)}...`);
        console.log(`    Attachments count: ${msg.attachments.length}`);
        
        msg.attachments.forEach((att, idx) => {
          console.log(`      Attachment ${idx + 1}:`);
          console.log(`        Name: ${att.name}`);
          console.log(`        ContentType: ${att.contentType}`);
          console.log(`        MediaType: ${att.mediaType}`);
          console.log(`        LocalPath: ${att.localPath}`);
          console.log(`        Downloaded: ${att.downloaded}`);
        });
        console.log('');
      }
      
      if (messagesWithAttachments.length > 3) {
        console.log(`    ... and ${messagesWithAttachments.length - 3} more messages with attachments\n`);
      }
      
      console.log('---\n');
    }

    // Also check for messages with any attachment-related fields
    const allChats = await Chat.find();
    let totalMessagesChecked = 0;
    let messagesWithAttachmentFields = 0;

    for (const chat of allChats) {
      for (const msg of chat.messages) {
        totalMessagesChecked++;
        if (msg.attachments || msg.attachment) {
          messagesWithAttachmentFields++;
          if (messagesWithAttachmentFields <= 5) {
            console.log(`Message with attachment fields found:`);
            console.log(`  Message ID: ${msg.messageId}`);
            console.log(`  Has attachments: ${!!msg.attachments}`);
            console.log(`  Has attachment: ${!!msg.attachment}`);
            if (msg.attachments) {
              console.log(`  Attachments length: ${msg.attachments.length}`);
            }
            if (msg.attachment) {
              console.log(`  Attachment object: ${JSON.stringify(msg.attachment, null, 2)}`);
            }
            console.log('');
          }
        }
      }
    }

    console.log(`\nSummary:`);
    console.log(`Total messages checked: ${totalMessagesChecked}`);
    console.log(`Messages with attachment fields: ${messagesWithAttachmentFields}`);
    console.log(`Chats with attachments: ${chatsWithAttachments.length}`);

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkDatabaseAttachments();
