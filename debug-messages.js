const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function debugMessages() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/email_scrap');
    console.log('✅ Connected to MongoDB');
    
    // Check accounts first
    const accounts = await Account.find({}).select('email name status');
    console.log(`📧 Found ${accounts.length} accounts:`);
    accounts.forEach(acc => {
      console.log(`- ${acc.email} (${acc.name}) - Status: ${acc.status}`);
    });
    
    // Check chats
    const chatCount = await Chat.countDocuments({});
    console.log(`\n💬 Total chats in database: ${chatCount}`);
    
    if (chatCount === 0) {
      console.log('❌ No chats found in database');
      console.log('🔧 This explains why you\'re not seeing media messages!');
      console.log('\n📋 Next steps:');
      console.log('1. Add a Google account via the frontend');
      console.log('2. Run chat sync to fetch messages from Google Chat API');
      console.log('3. Media messages should then be detected and saved');
      return;
    }
    
    // Find any chat with messages
    const chat = await Chat.findOne({ 'messages.0': { $exists: true } })
                          .select('displayName messages')
                          .limit(1);
    
    if (!chat) {
      console.log('❌ No chats with messages found');
      console.log('🔧 Chats exist but have no messages - sync may be needed');
      return;
    }
    
    console.log(`📁 Found chat: ${chat.displayName}`);
    console.log(`📊 Total messages: ${chat.messages.length}`);
    
    // Check first few messages
    for (let i = 0; i < Math.min(3, chat.messages.length); i++) {
      const msg = chat.messages[i];
      console.log(`\n🔍 Message ${i + 1}:`);
      console.log(`- messageId: ${msg.messageId}`);
      console.log(`- text: ${msg.text ? `"${msg.text.substring(0, 50)}..."` : 'EMPTY/NULL'}`);
      console.log(`- body: ${msg.body ? `"${msg.body.substring(0, 50)}..."` : 'EMPTY/NULL'}`);
      console.log(`- attachments field exists: ${!!msg.attachments}`);
      console.log(`- attachment field exists: ${!!msg.attachment}`);
      console.log(`- attachments count: ${msg.attachments ? msg.attachments.length : 0}`);
      console.log(`- attachment count: ${msg.attachment ? msg.attachment.length : 0}`);
      console.log(`- sender: ${msg.senderDisplayName || 'Unknown'}`);
      
      // Show all keys for this message
      const keys = Object.keys(msg.toObject ? msg.toObject() : msg);
      console.log(`- All fields: [${keys.join(', ')}]`);
      
      // If there are attachments, show the first one
      const attachments = msg.attachments || msg.attachment || [];
      if (attachments && attachments.length > 0) {
        const att = attachments[0];
        console.log(`📎 First attachment:`);
        console.log(`  - filename: ${att.filename || att.name || 'unknown'}`);
        console.log(`  - contentType: ${att.contentType || att.mimeType || 'unknown'}`);
        console.log(`  - localPath: ${att.localPath || 'none'}`);
        console.log(`  - downloadStatus: ${att.downloadStatus || 'unknown'}`);
      }
    }
    
    // Check if there are any messages with media only (no text)
    const mediaOnlyMessages = chat.messages.filter(msg => 
      (!msg.text || msg.text.trim() === '') && 
      ((msg.attachments && msg.attachments.length > 0) || (msg.attachment && msg.attachment.length > 0))
    );
    
    console.log(`\n📸 Messages with media only (no text): ${mediaOnlyMessages.length}`);
    
    if (mediaOnlyMessages.length > 0) {
      const mediaMsg = mediaOnlyMessages[0];
      console.log(`🎯 Example media-only message:`);
      console.log(`- messageId: ${mediaMsg.messageId}`);
      console.log(`- text: "${mediaMsg.text}"`);
      console.log(`- body: "${mediaMsg.body}"`);
      console.log(`- attachments: ${mediaMsg.attachments ? mediaMsg.attachments.length : 0}`);
      console.log(`- attachment: ${mediaMsg.attachment ? mediaMsg.attachment.length : 0}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

debugMessages();
