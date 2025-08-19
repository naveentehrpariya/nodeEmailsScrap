const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const fs = require('fs');
const path = require('path');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function fixAllMediaPaths() {
  try {
    console.log('🔧 FIXING ALL MEDIA ATTACHMENT PATHS (Images, Videos, Documents)');
    console.log('='.repeat(80));

    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Get list of all files in media directory
    const mediaDir = path.join(__dirname, 'media');
    const allFiles = fs.readdirSync(mediaDir).filter(file => {
      return !fs.statSync(path.join(mediaDir, file)).isDirectory();
    });

    console.log(`📁 Found ${allFiles.length} files in media directory:`);
    allFiles.forEach((file, index) => {
      const ext = path.extname(file).toLowerCase();
      const type = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? '🖼️' :
                   ['.mp4', '.avi', '.mov', '.wmv', '.webm'].includes(ext) ? '🎥' :
                   ['.pdf', '.doc', '.docx'].includes(ext) ? '📄' : '📁';
      console.log(`   ${index + 1}. ${type} ${file}`);
    });
    console.log('');

    // Categorize files
    const imageFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
    });

    const videoFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp4', '.avi', '.mov', '.wmv', '.webm'].includes(ext);
    });

    const documentFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.pdf', '.doc', '.docx', '.txt'].includes(ext);
    });

    console.log(`📊 File breakdown:`);
    console.log(`   🖼️ Images: ${imageFiles.length}`);
    console.log(`   🎥 Videos: ${videoFiles.length}`);
    console.log(`   📄 Documents: ${documentFiles.length}\n`);

    // Find all chats with media attachments that need path fixes
    const chats = await Chat.find({
      'messages.attachments.0': { $exists: true }
    });

    console.log(`📊 Found ${chats.length} chats with attachments to check:\n`);

    let totalFixed = 0;

    for (const chat of chats) {
      console.log(`🔍 Processing: ${chat.displayName || '(Direct Message)'} (${chat.spaceType})`);
      
      let chatUpdated = false;
      
      for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
        const msg = chat.messages[msgIndex];
        
        if (!msg.attachments || msg.attachments.length === 0) continue;
        
        for (let attIndex = 0; attIndex < msg.attachments.length; attIndex++) {
          const att = msg.attachments[attIndex];
          
          // Skip if already has localPath
          if (att.localPath) {
            continue;
          }

          let matchedFile = null;
          let fileType = 'unknown';

          // Determine attachment type and find matching file
          if (att.isImage || (att.contentType && att.contentType.includes('image'))) {
            fileType = 'image';
            console.log(`   🖼️ Fixing image: ${att.name}`);
            
            // Try to match by content name or just pick the first available image
            if (att.contentName) {
              matchedFile = imageFiles.find(file => file.includes(att.contentName.split('.')[0]));
            }
            if (!matchedFile && imageFiles.length > 0) {
              const ext = att.contentType === 'image/png' ? '.png' : 
                         att.contentType === 'image/jpeg' ? '.jpg' : '.png';
              matchedFile = imageFiles.find(file => file.toLowerCase().endsWith(ext)) || imageFiles[0];
            }
            
          } else if (att.isVideo || (att.contentType && att.contentType.includes('video'))) {
            fileType = 'video';
            console.log(`   🎥 Fixing video: ${att.name}`);
            
            // Try to match by content name or just pick the first available video
            if (att.contentName) {
              matchedFile = videoFiles.find(file => file.includes(att.contentName.split('.')[0]));
            }
            if (!matchedFile && videoFiles.length > 0) {
              const ext = att.contentType === 'video/mp4' ? '.mp4' : 
                         att.contentType === 'video/quicktime' ? '.mov' : '.mp4';
              matchedFile = videoFiles.find(file => file.toLowerCase().endsWith(ext)) || videoFiles[0];
            }
            
          } else if (att.isDocument || (att.contentType && (att.contentType.includes('pdf') || att.contentType.includes('document')))) {
            fileType = 'document';
            console.log(`   📄 Fixing document: ${att.name}`);
            
            // Try to match by content name or just pick the first available document
            if (att.contentName) {
              matchedFile = documentFiles.find(file => file.includes(att.contentName.split('.')[0]));
            }
            if (!matchedFile && documentFiles.length > 0) {
              const ext = att.contentType === 'application/pdf' ? '.pdf' : '.pdf';
              matchedFile = documentFiles.find(file => file.toLowerCase().endsWith(ext)) || documentFiles[0];
            }
          }

          if (matchedFile) {
            const localPath = path.join(mediaDir, matchedFile);
            chat.messages[msgIndex].attachments[attIndex].localPath = localPath;
            chat.messages[msgIndex].attachments[attIndex].filename = matchedFile;
            
            // Update the name to be more user-friendly
            if (att.contentName) {
              chat.messages[msgIndex].attachments[attIndex].name = att.contentName;
            } else {
              chat.messages[msgIndex].attachments[attIndex].name = matchedFile.replace(/^\d+_/, '');
            }
            
            console.log(`      ✅ Set localPath: ${localPath}`);
            console.log(`      ✅ Set filename: ${matchedFile}`);
            console.log(`      ✅ Set name: ${chat.messages[msgIndex].attachments[attIndex].name}`);
            
            chatUpdated = true;
            totalFixed++;
            
            // Remove this file from available files to avoid duplicates
            if (fileType === 'image') {
              const fileIndex = imageFiles.indexOf(matchedFile);
              if (fileIndex > -1) imageFiles.splice(fileIndex, 1);
            } else if (fileType === 'video') {
              const fileIndex = videoFiles.indexOf(matchedFile);
              if (fileIndex > -1) videoFiles.splice(fileIndex, 1);
            } else if (fileType === 'document') {
              const fileIndex = documentFiles.indexOf(matchedFile);
              if (fileIndex > -1) documentFiles.splice(fileIndex, 1);
            }
          } else {
            console.log(`      ❌ No matching ${fileType} file found for ${att.name}`);
          }
        }
      }
      
      if (chatUpdated) {
        await chat.save();
        console.log(`   💾 Saved updates to ${chat.displayName || '(Direct Message)'}`);
      }
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('🎉 ALL MEDIA PATHS FIX COMPLETED!');
    console.log(`📊 Total media items fixed: ${totalFixed}`);
    
    if (totalFixed > 0) {
      console.log('✅ All media attachments (images, videos, documents) should now display properly!');
    } else {
      console.log('⚠️ No media paths were fixed - they may already be correct');
    }

  } catch (error) {
    console.error('❌ Error during media path fix:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixAllMediaPaths();
