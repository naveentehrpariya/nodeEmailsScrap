const { MongoClient } = require('mongodb');
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function fixAttachmentPaths() {
  try {
    await client.connect();
    const db = client.db('emailscrap');
    
    console.log('Fixing attachment paths for all chats...');
    
    const chats = await db.collection('chats').find({}).toArray();
    let updatedChats = 0;
    let updatedAttachments = 0;
    
    for (const chat of chats) {
      let chatNeedsUpdate = false;
      
      for (const message of chat.messages) {
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            // Fix localFilePath to just store filename
            if (attachment.localFilePath && attachment.localFilePath.includes('/api/media/files/')) {
              const filename = attachment.localFilePath.replace('/api/media/files/', '');
              attachment.localFilePath = filename;
              chatNeedsUpdate = true;
              updatedAttachments++;
              console.log('Fixed attachment path:', filename);
            }
            
            // Also fix localPath field if it exists
            if (attachment.localPath && attachment.localPath.includes('/api/media/files/')) {
              const filename = attachment.localPath.replace('/api/media/files/', '');
              attachment.localPath = filename;
              if (!chatNeedsUpdate) {
                chatNeedsUpdate = true;
                updatedAttachments++;
              }
              console.log('Fixed attachment local path:', filename);
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
    console.log('- Fixed', updatedAttachments, 'attachment paths');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

fixAttachmentPaths();
