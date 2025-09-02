const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const analyzeMissingMedia = async () => {
  try {
    const client = new MongoClient('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net');
    await client.connect();
    const db = client.db('emails');
    
    const mediaDirectory = path.join(__dirname, 'media');
    const existingFiles = fs.readdirSync(mediaDirectory).filter(f => !f.startsWith('.') && !f.startsWith('sample'));
    
    console.log('📁 Existing files in media directory:');
    existingFiles.forEach(f => {
      const stats = fs.statSync(path.join(mediaDirectory, f));
      console.log(`  ✅ ${f} (${Math.round(stats.size/1024)}KB)`);
    });
    
    const chats = await db.collection('chats').find({
      'messages.attachments': { $exists: true, $ne: [] }
    }).toArray();
    
    console.log(`\n📋 Found ${chats.length} chats with attachments`);
    
    const allAttachments = [];
    let totalAttachments = 0;
    
    chats.forEach((chat, chatIndex) => {
      console.log(`\nChat ${chatIndex + 1}: ${chat.spaceId}`);
      
      chat.messages.forEach((message, msgIndex) => {
        if (message.attachments && message.attachments.length > 0) {
          console.log(`  Message ${msgIndex + 1}: ${message.attachments.length} attachments`);
          
          message.attachments.forEach((attachment, attIndex) => {
            totalAttachments++;
            const filename = attachment.filename || attachment.contentName;
            const fileExists = filename && existingFiles.includes(filename);
            const hasLocalPath = !!attachment.localPath;
            const hasDownloadUrl = !!attachment.downloadUrl;
            const hasThumbnailUrl = !!attachment.thumbnailUrl;
            const hasDriveFile = !!(attachment.driveFile && attachment.driveFile.name);
            
            console.log(`    Att ${attIndex + 1}: ${filename || 'NO_FILENAME'}`);
            console.log(`      - File exists locally: ${fileExists}`);
            console.log(`      - Has localPath in DB: ${hasLocalPath}`);
            console.log(`      - Has downloadUrl: ${hasDownloadUrl}`);
            console.log(`      - Has thumbnailUrl: ${hasThumbnailUrl}`);
            console.log(`      - Has driveFile: ${hasDriveFile}`);
            
            if (filename && !fileExists) {
              allAttachments.push({
                filename,
                chatId: chat.spaceId,
                messageId: message.messageId,
                attachmentId: attachment._id.toString(),
                downloadUrl: attachment.downloadUrl,
                thumbnailUrl: attachment.thumbnailUrl,
                driveFile: attachment.driveFile,
                contentType: attachment.contentType || attachment.mimeType
              });
            }
          });
        }
      });
    });
    
    console.log(`\n🔍 MISSING FILES ANALYSIS:`);
    console.log(`Total attachments in database: ${totalAttachments}`);
    console.log(`Files available locally: ${existingFiles.length}`);
    console.log(`Missing files: ${allAttachments.length}`);
    
    if (allAttachments.length > 0) {
      console.log('\n❌ Files that need to be downloaded:');
      allAttachments.forEach((att, index) => {
        console.log(`${index + 1}. ${att.filename}`);
        console.log(`   - Type: ${att.contentType}`);
        console.log(`   - Chat: ${att.chatId}`);
        console.log(`   - Has downloadUrl: ${!!att.downloadUrl}`);
        console.log(`   - Has driveFile: ${!!(att.driveFile && att.driveFile.name)}`);
        
        if (att.downloadUrl) {
          console.log(`   - Download URL: ${att.downloadUrl.substring(0, 80)}...`);
        }
        
        if (att.driveFile && att.driveFile.name) {
          console.log(`   - Drive file: ${att.driveFile.name}`);
        }
        console.log('');
      });
    } else {
      console.log('\n✅ All attachments have local files!');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error in analysis:', error);
  }
};

analyzeMissingMedia();
