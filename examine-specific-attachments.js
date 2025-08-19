const mongoose = require('mongoose');
const Chat = require('./db/Chat');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/emailscrap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function examineSpecificAttachments() {
  try {
    console.log('Examining specific messages with attachment fields...\n');

    // Find messages that have attachments field (even if empty)
    const chats = await Chat.find({
      'messages.attachments': { $exists: true }
    });

    console.log(`Found ${chats.length} chats with messages having attachments field\n`);

    let messageCount = 0;
    for (const chat of chats) {
      console.log(`Chat ID: ${chat.chatId}`);
      console.log(`Chat Name: ${chat.name || 'No name'}`);
      console.log(`Account: ${chat.accountEmail}\n`);
      
      for (const msg of chat.messages) {
        if (msg.attachments) {
          messageCount++;
          console.log(`Message ${messageCount}:`);
          console.log(`  Message ID: ${msg.messageId}`);
          console.log(`  Text: ${(msg.text || '').substring(0, 100)}...`);
          console.log(`  Created: ${msg.createTime}`);
          console.log(`  Attachments exists: ${!!msg.attachments}`);
          console.log(`  Attachments length: ${msg.attachments.length}`);
          
          if (msg.attachments.length > 0) {
            console.log(`  Attachment details:`);
            msg.attachments.forEach((att, idx) => {
              console.log(`    Attachment ${idx + 1}:`);
              console.log(`      Full object: ${JSON.stringify(att, null, 6)}`);
            });
          } else {
            console.log(`  Attachments array is empty: ${JSON.stringify(msg.attachments)}`);
          }
          console.log('');
          
          // Only show first 10 messages to avoid too much output
          if (messageCount >= 10) break;
        }
      }
      if (messageCount >= 10) break;
    }

    console.log(`\nTotal messages with attachments field examined: ${messageCount}`);

  } catch (error) {
    console.error('Error examining attachments:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

examineSpecificAttachments();
