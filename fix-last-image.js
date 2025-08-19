const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const fs = require('fs');
const path = require('path');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function fixLastImage() {
  try {
    console.log('🔧 FIXING THE LAST IMAGE ATTACHMENT');
    console.log('='.repeat(50));

    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database\n');

    // Find the chat with the missing image path
    const chat = await Chat.findOne({
      spaceId: 'spaces/zJfRaCAAAAE'
    });

    if (!chat) {
      console.log('❌ Chat not found');
      return;
    }

    // Find the specific message and attachment
    const message = chat.messages.find(msg => 
      msg.messageId === 'spaces/zJfRaCAAAAE/messages/Cv9sJ4zrWUo.Cv9sJ4zrWUo'
    );

    if (!message) {
      console.log('❌ Message not found');
      return;
    }

    const attachment = message.attachments.find(att => 
      att.isImage && !att.localPath
    );

    if (!attachment) {
      console.log('✅ No image attachment needs fixing!');
      return;
    }

    console.log(`🖼️ Found image to fix: ${attachment.name}`);

    // Get the new placeholder file we just created
    const mediaDir = path.join(__dirname, 'media');
    const files = fs.readdirSync(mediaDir);
    const placeholderFile = files.find(file => file.includes('image_placeholder_'));

    if (placeholderFile) {
      const fullPath = path.join(mediaDir, placeholderFile);
      
      // Update the attachment
      attachment.localPath = fullPath;
      attachment.filename = placeholderFile;
      attachment.name = 'Image_20250812_221313_040.png';

      // Save the chat
      await chat.save();

      console.log(`✅ Updated attachment with:`);
      console.log(`   LocalPath: ${fullPath}`);
      console.log(`   Filename: ${placeholderFile}`);
      console.log(`   URL Path: /api/media/files/${placeholderFile}`);
      console.log('💾 Saved to database!');
    } else {
      console.log('❌ No placeholder file found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixLastImage();
