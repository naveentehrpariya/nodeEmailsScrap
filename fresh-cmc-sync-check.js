const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const chatSyncService = require('./services/chatSyncService');

async function freshCMCSyncCheck() {
  try {
    console.log('🔄 Starting fresh CMC sync and verification...\n');

    // Connect to database
    await mongoose.connect('mongodb://localhost:27017/emailscrap', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Get naveendev account
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!account) {
      console.error('❌ Account not found: naveendev@crossmilescarrier.com');
      return;
    }

    console.log(`✅ Found account: ${account.email} (ID: ${account._id})\n`);

    // Check current CMC chat state
    console.log('📊 Current CMC chat state:');
    const currentCMC = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (currentCMC) {
      console.log(`  Chat ID: ${currentCMC._id}`);
      console.log(`  Display Name: ${currentCMC.displayName}`);
      console.log(`  Message Count: ${currentCMC.messageCount}`);
      console.log(`  Last Updated: ${currentCMC.updatedAt}`);
      
      const attachmentCounts = currentCMC.messages.map(msg => ({
        messageId: msg.messageId.split('/').pop(),
        text: (msg.text || '(no text)').substring(0, 30),
        attachments: msg.attachments ? msg.attachments.length : 0
      }));
      
      console.log('  Messages:');
      attachmentCounts.forEach((msg, i) => {
        console.log(`    ${i + 1}. ${msg.messageId} - "${msg.text}..." - ${msg.attachments} attachments`);
      });
    } else {
      console.log('  ❌ No CMC chat found');
    }

    console.log('\n🔄 Running fresh sync for naveendev account...');
    
    // Run sync
    const syncResult = await chatSyncService.syncAccountChats(account);
    
    console.log('\n✅ Sync completed:');
    console.log(`  Synced chats: ${syncResult.syncedChats}`);
    console.log(`  Synced messages: ${syncResult.syncedMessages}`);
    console.log(`  Total spaces: ${syncResult.totalSpaces}`);
    console.log(`  Duration: ${syncResult.duration}s`);

    // Check CMC chat after sync
    console.log('\n📊 CMC chat state AFTER sync:');
    const updatedCMC = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (updatedCMC) {
      console.log(`  Chat ID: ${updatedCMC._id}`);
      console.log(`  Display Name: ${updatedCMC.displayName}`);
      console.log(`  Message Count: ${updatedCMC.messageCount}`);
      console.log(`  Last Updated: ${updatedCMC.updatedAt}`);
      
      const updatedAttachmentCounts = updatedCMC.messages.map(msg => ({
        messageId: msg.messageId.split('/').pop(),
        text: (msg.text || '(no text)').substring(0, 30),
        attachments: msg.attachments ? msg.attachments.length : 0,
        hasAttachmentData: msg.attachments && msg.attachments.length > 0 ? 
          msg.attachments.every(att => att.name && att.contentType && att.downloadStatus) : false
      }));
      
      console.log('  Messages AFTER sync:');
      updatedAttachmentCounts.forEach((msg, i) => {
        const status = msg.attachments > 0 ? (msg.hasAttachmentData ? '✅' : '⚠️') : '➖';
        console.log(`    ${status} ${i + 1}. ${msg.messageId} - "${msg.text}..." - ${msg.attachments} attachments`);
      });

      // Show detailed attachment info for media messages
      console.log('\n📎 Detailed attachment info:');
      updatedCMC.messages.forEach((msg, i) => {
        if (msg.attachments && msg.attachments.length > 0) {
          console.log(`\n  Message ${i + 1} attachments:`);
          msg.attachments.forEach((att, j) => {
            console.log(`    ${j + 1}. ${att.name || att.contentName || 'Unknown'}`);
            console.log(`       Type: ${att.contentType}`);
            console.log(`       Media Type: ${att.mediaType}`);
            console.log(`       Downloaded: ${att.downloadStatus}`);
            console.log(`       Local Path: ${att.localPath}`);
            console.log(`       File Size: ${att.fileSize} bytes`);
          });
        }
      });

      console.log('\n🎉 CMC chat verification complete!');
      console.log('The correct chat ID to look for in your database browser is:');
      console.log(`📍 ${updatedCMC._id.toString()}`);
      
    } else {
      console.log('  ❌ Still no CMC chat found after sync');
    }

  } catch (error) {
    console.error('❌ Error during fresh sync check:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

freshCMCSyncCheck();
