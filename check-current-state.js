const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://naveentehrpariya:Naveen%402024@cluster0.tsvps.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);

async function checkCurrentState() {
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    const db = client.db('emailScrap');
    const chatsCollection = db.collection('chats');
    
    const chats = await chatsCollection.find({}).toArray();
    console.log(`\nFound ${chats.length} chats in database`);
    
    let totalAttachments = 0;
    let chatsWithMedia = 0;
    
    chats.forEach((chat, index) => {
      const chatAttachments = chat.messages ? chat.messages.reduce((acc, msg) => {
        return acc + (msg.attachments ? msg.attachments.length : 0);
      }, 0) : 0;
      
      if (chatAttachments > 0) {
        chatsWithMedia++;
        console.log(`\nChat ${index + 1}: "${chat.name || chat.space?.displayName || 'Unnamed'}"`);
        console.log(`  - Space ID: ${chat.spaceId || 'N/A'}`);
        console.log(`  - Messages: ${chat.messages ? chat.messages.length : 0}`);
        console.log(`  - Attachments: ${chatAttachments}`);
        
        // Show details of attachments
        chat.messages.forEach((msg, msgIndex) => {
          if (msg.attachments && msg.attachments.length > 0) {
            console.log(`    Message ${msgIndex + 1}: ${msg.attachments.length} attachments`);
            msg.attachments.forEach((att, attIndex) => {
              console.log(`      ${attIndex + 1}. ${att.name || 'Unnamed'} (${att.contentType || 'Unknown type'})`);
              console.log(`         Local path: ${att.localPath || 'NOT SET'}`);
              console.log(`         Download status: ${att.downloadStatus || 'NOT SET'}`);
            });
          }
        });
      }
      totalAttachments += chatAttachments;
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total chats: ${chats.length}`);
    console.log(`Chats with media: ${chatsWithMedia}`);
    console.log(`Total attachments: ${totalAttachments}`);
    
    if (totalAttachments === 0) {
      console.log('\n🚨 NO MEDIA ATTACHMENTS FOUND! Media has disappeared after resync.');
    } else {
      console.log('\n✅ Media attachments are present in the database.');
    }
    
  } catch (error) {
    console.error('Error checking database state:', error);
  } finally {
    await client.close();
  }
}

checkCurrentState();
