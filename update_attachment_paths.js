const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const updateAttachmentPaths = async () => {
  try {
    const client = new MongoClient('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net');
    await client.connect();
    const db = client.db('emails');
    
    // Get list of files in media directory
    const mediaDirectory = path.join(__dirname, 'media');
    const files = fs.readdirSync(mediaDirectory).filter(file => {
      const filePath = path.join(mediaDirectory, file);
      return fs.statSync(filePath).isFile() && !file.startsWith('.') && !file.startsWith('sample');
    });
    
    console.log('Available media files:', files);
    
    // First check total chats
    const totalChats = await db.collection('chats').countDocuments();
    console.log(`Total chats in database: ${totalChats}`);
    
    // Find all chats (not just with attachments)
    const allChats = await db.collection('chats').find({}).toArray();
    console.log(`Found ${allChats.length} total chats`);
    
    // Check which have attachments
    const chatsWithAttachments = allChats.filter(chat => 
      chat.messages && chat.messages.some(msg => 
        msg.attachments && msg.attachments.length > 0
      )
    );
    
    console.log(`Found ${chatsWithAttachments.length} chats with attachments`);
    
    const chats = chatsWithAttachments;
    
    let updateCount = 0;
    
    for (const chat of chats) {
      console.log(`\nChecking chat: ${chat.spaceId}`);
      for (const message of chat.messages) {
        if (message.attachments && message.attachments.length > 0) {
          console.log(`  Message with ${message.attachments.length} attachments`);
          for (let i = 0; i < message.attachments.length; i++) {
            const attachment = message.attachments[i];
            const filename = attachment.filename || attachment.contentName;
            
            console.log(`    Attachment: ${filename}`);
            console.log(`      Has localPath: ${!!attachment.localPath}`);
            console.log(`      File exists: ${files.includes(filename)}`);
            
            // Check if file exists in media directory and doesn't already have localPath
            if (filename && files.includes(filename) && !attachment.localPath) {
              console.log(`Attempting to update: ${filename} for attachment ${attachment._id}`);
              
              // Try a different approach - update by finding the specific attachment
              const updateResult = await db.collection('chats').updateOne(
                {
                  '_id': chat._id
                },
                {
                  $set: {
                    'messages.$[msg].attachments.$[att].localPath': `/media/${filename}`
                  }
                },
                {
                  arrayFilters: [
                    { 'msg._id': message._id },
                    { 'att._id': attachment._id }
                  ]
                }
              );
              
              if (updateResult.modifiedCount > 0) {
                console.log(`✅ Updated ${filename} with localPath for attachment ${attachment._id}`);
                updateCount++;
              } else {
                console.log(`❌ Failed to update ${filename} for attachment ${attachment._id}`);
                console.log('  Chat ID:', chat._id.toString());
                console.log('  Message ID:', message._id.toString());
                console.log('  Attachment ID:', attachment._id.toString());
              }
            }
          }
        }
      }
    }
    
    console.log(`\n🎉 Updated ${updateCount} attachments with local file paths`);
    
    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

updateAttachmentPaths();
