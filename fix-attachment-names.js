const { MongoClient } = require('mongodb');
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function fixAttachmentNames() {
  try {
    await client.connect();
    const db = client.db('emailscrap');
    
    console.log('Fixing attachment names for all chats...');
    
    const chats = await db.collection('chats').find({}).toArray();
    let updatedChats = 0;
    let updatedAttachments = 0;
    
    for (const chat of chats) {
      let chatNeedsUpdate = false;
      
      for (const message of chat.messages) {
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            // Fix name if it's undefined or 'undefined' string
            if (!attachment.name || attachment.name === 'undefined') {
              if (attachment.contentName) {
                attachment.name = attachment.contentName;
              } else if (attachment.localFilePath) {
                // Extract filename from localFilePath, removing timestamp prefix
                const fileName = attachment.localFilePath.split('/').pop().replace(/^\d+_/, '');
                attachment.name = fileName;
              } else {
                attachment.name = 'Unnamed attachment';
              }
              chatNeedsUpdate = true;
              updatedAttachments++;
              console.log('Fixed attachment name:', attachment.name);
            }
          }
        }
      }
      
      if (chatNeedsUpdate) {
        await db.collection('chats').updateOne(
          { _id: chat._id },
          { $set: { messages: chat.messages } }
        );
        updatedChats++;
        console.log('Updated chat:', chat.displayName || chat.spaceId);
      }
    }
    
    console.log('');
    console.log('Summary:');
    console.log('- Updated', updatedChats, 'chats');
    console.log('- Fixed', updatedAttachments, 'attachment names');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

fixAttachmentNames();
