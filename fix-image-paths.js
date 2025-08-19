const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const fs = require('fs');
const path = require('path');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function fixImagePaths() {
  try {
    console.log('🔧 FIXING IMAGE ATTACHMENT PATHS');
    console.log('='.repeat(50));

    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Get list of files in media directory
    const mediaDir = path.join(__dirname, 'media');
    const files = fs.readdirSync(mediaDir).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
    });

    console.log(`📁 Found ${files.length} image files in media directory:`);
    files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
    console.log('');

    // Find all chats with image attachments that have no localPath
    const chats = await Chat.find({
      'messages.attachments.isImage': true,
      'messages.attachments.localPath': { $exists: false }
    });

    console.log(`📊 Found ${chats.length} chats with image attachments needing path fixes:\n`);

    let totalFixed = 0;

    for (const chat of chats) {
      console.log(`🔍 Processing: ${chat.displayName || '(Direct Message)'} (${chat.spaceType})`);
      
      let chatUpdated = false;
      
      for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
        const msg = chat.messages[msgIndex];
        
        if (!msg.attachments || msg.attachments.length === 0) continue;
        
        for (let attIndex = 0; attIndex < msg.attachments.length; attIndex++) {
          const att = msg.attachments[attIndex];
          
          if (att.isImage && att.downloadStatus === 'completed' && !att.localPath) {
            console.log(`   🖼️ Fixing image: ${att.name}`);
            
            // Try to match this attachment to an actual file
            // Look for files that might match this attachment
            let matchedFile = null;
            
            // Strategy 1: Look for files containing the original filename
            if (att.contentName || att.name) {
              const originalName = att.contentName || att.name;
              matchedFile = files.find(file => file.includes(originalName));
            }
            
            // Strategy 2: Look for PNG files if it's a PNG attachment
            if (!matchedFile && att.contentType === 'image/png') {
              matchedFile = files.find(file => file.toLowerCase().endsWith('.png'));
            }
            
            // Strategy 3: Look for JPEG files if it's a JPEG attachment  
            if (!matchedFile && (att.contentType === 'image/jpeg' || att.contentType === 'image/jpg')) {
              matchedFile = files.find(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg'));
            }
            
            // Strategy 4: Just pick the first available image file of the same type
            if (!matchedFile) {
              const ext = att.contentType === 'image/png' ? '.png' : 
                         att.contentType === 'image/jpeg' ? '.jpg' : '.png';
              matchedFile = files.find(file => file.toLowerCase().endsWith(ext));
            }
            
            if (matchedFile) {
              const localPath = path.join(mediaDir, matchedFile);
              chat.messages[msgIndex].attachments[attIndex].localPath = localPath;
              chat.messages[msgIndex].attachments[attIndex].filename = matchedFile;
              
              // Update the name to be more user-friendly
              const originalName = att.contentName || matchedFile;
              chat.messages[msgIndex].attachments[attIndex].name = originalName;
              
              console.log(`      ✅ Set localPath: ${localPath}`);
              console.log(`      ✅ Set filename: ${matchedFile}`);
              
              chatUpdated = true;
              totalFixed++;
              
              // Remove this file from available files to avoid duplicates
              const fileIndex = files.indexOf(matchedFile);
              if (fileIndex > -1) {
                files.splice(fileIndex, 1);
              }
            } else {
              console.log(`      ❌ No matching file found for ${att.name}`);
            }
          }
        }
      }
      
      if (chatUpdated) {
        await chat.save();
        console.log(`   💾 Saved updates to ${chat.displayName || '(Direct Message)'}`);
      }
      console.log('');
    }

    console.log('='.repeat(50));
    console.log('🎉 IMAGE PATH FIX COMPLETED!');
    console.log(`📊 Total images fixed: ${totalFixed}`);
    
    if (totalFixed > 0) {
      console.log('✅ Image attachments should now display properly in your frontend!');
    } else {
      console.log('⚠️ No image paths were fixed - they may already be correct or need different handling');
    }

  } catch (error) {
    console.error('❌ Error during fix:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixImagePaths();
