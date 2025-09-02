const { MongoClient } = require('mongodb');

const connectDB = async () => {
  try {
    const client = new MongoClient('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net');
    await client.connect();
    const db = client.db('emails');
    
    // Try different queries to find attachments
    const chatsWithAnyAttachments = await db.collection('chats').aggregate([
      { $match: { 'messages.attachments': { $exists: true } } },
      { $limit: 3 },
      { 
        $project: { 
          spaceId: 1, 
          'messages.attachments': 1,
          'messages.text': 1
        } 
      }
    ]).toArray();
    
    const chats = chatsWithAnyAttachments;
    
    // First check what collections exist
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    const chatsCount = await db.collection('chats').countDocuments();
    console.log('Total chats:', chatsCount);
    
    if (chatsCount > 0) {
      const sampleChat = await db.collection('chats').findOne();
      console.log('Sample chat structure:', Object.keys(sampleChat));
      if (sampleChat.messages && sampleChat.messages.length > 0) {
        console.log('Sample message structure:', Object.keys(sampleChat.messages[0]));
      }
    }
    
    const chatsWithAttachments = await db.collection('chats').countDocuments({
      'messages.attachments': { $exists: true, $ne: [] }
    });
    console.log('Chats with attachments:', chatsWithAttachments);
    
    console.log('\n=== ATTACHMENTS WITH IDs ===');
    chats.forEach((chat, i) => {
      console.log(`\nChat ${i + 1}: ${chat.spaceId}`);
      chat.messages.forEach((msg, j) => {
        if (msg.attachments && msg.attachments.length > 0) {
          msg.attachments.forEach((att, k) => {
            console.log(`  Attachment ${k + 1}:`);
            console.log(`    ID: ${att._id}`);
            console.log(`    Name: ${att.filename || att.contentName}`);
            console.log(`    Type: ${att.contentType || att.mimeType}`);
            console.log(`    Download Status: ${att.downloadStatus}`);
            console.log(`    Local Path: ${att.localPath || 'none'}`);
            console.log(`    Has downloadUrl: ${!!att.downloadUrl}`);
            console.log(`    Has thumbnailUrl: ${!!att.thumbnailUrl}`);
          });
        }
      });
    });
    
    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

connectDB();
