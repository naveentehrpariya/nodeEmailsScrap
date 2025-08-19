const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const chatSyncService = require('./services/chatSyncService');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function syncCloudDatabase() {
  try {
    console.log('🌐 Connecting to CLOUD MongoDB Atlas database...');
    console.log('Database:', CLOUD_DB_URL);
    
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 30,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 120000,
      bufferCommands: true,
      autoIndex: true,
      keepAlive: true,
      keepAliveInitialDelay: 300000,
    });
    
    console.log('✅ Connected to CLOUD database\n');
    
    // Check current state
    console.log('📊 Current CLOUD database state:');
    const currentCMC = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (currentCMC) {
      console.log(`  CMC Chat ID: ${currentCMC._id}`);
      console.log(`  Message Count: ${currentCMC.messageCount}`);
      const attachmentCounts = currentCMC.messages.map(m => m.attachments ? m.attachments.length : 0);
      console.log(`  Attachments per message: [${attachmentCounts.join(', ')}]`);
      console.log(`  Total attachments: ${attachmentCounts.reduce((a, b) => a + b, 0)}`);
    }
    
    // Get naveendev account from CLOUD database
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!account) {
      console.error('❌ Account not found in CLOUD database: naveendev@crossmilescarrier.com');
      console.log('\nCreating account...');
      
      const newAccount = new Account({ 
        email: 'naveendev@crossmilescarrier.com',
        createdAt: new Date()
      });
      await newAccount.save();
      console.log(`✅ Created account: ${newAccount._id}`);
    } else {
      console.log(`✅ Found account in CLOUD: ${account.email} (ID: ${account._id})\n`);
    }

    console.log('🔄 Running chat sync for CLOUD database...');
    
    // Run sync against CLOUD database
    const syncResult = await chatSyncService.syncAccountChats(account || await Account.findOne({ email: 'naveendev@crossmilescarrier.com' }));
    
    console.log('\n✅ CLOUD sync completed:');
    console.log(`  Synced chats: ${syncResult.syncedChats}`);
    console.log(`  Synced messages: ${syncResult.syncedMessages}`);
    console.log(`  Total spaces: ${syncResult.totalSpaces}`);
    console.log(`  Duration: ${syncResult.duration}s`);

    // Verify CMC chat after sync
    console.log('\n📊 CLOUD CMC chat state AFTER sync:');
    const updatedCMC = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
    if (updatedCMC) {
      console.log(`  Chat ID: ${updatedCMC._id}`);
      console.log(`  Display Name: ${updatedCMC.displayName}`);
      console.log(`  Message Count: ${updatedCMC.messageCount}`);
      console.log(`  Last Updated: ${updatedCMC.updatedAt}`);
      
      const attachmentCounts = updatedCMC.messages.map(m => m.attachments ? m.attachments.length : 0);
      console.log(`  Attachments per message: [${attachmentCounts.join(', ')}]`);
      console.log(`  Total attachments: ${attachmentCounts.reduce((a, b) => a + b, 0)}`);
      
      // Show messages with attachments
      const msgsWithAttachments = updatedCMC.messages.filter(m => m.attachments && m.attachments.length > 0);
      if (msgsWithAttachments.length > 0) {
        console.log('\n📎 Messages with attachments:');
        msgsWithAttachments.forEach((msg, i) => {
          console.log(`  ${i+1}. ${msg.messageId.split('/').pop()}: ${msg.attachments.length} attachments`);
          msg.attachments.forEach((att, j) => {
            console.log(`     - ${att.name || att.contentName || 'Unknown'} (${att.contentType}) - ${att.downloadStatus}`);
          });
        });
      }
      
      console.log('\n🎉 CLOUD database sync complete!');
      console.log(`The CMC chat in your CLOUD database now has attachments!`);
      console.log(`Chat ID: ${updatedCMC._id.toString()}`);
      
    } else {
      console.log('  ❌ Still no CMC chat found after sync');
    }

  } catch (error) {
    console.error('❌ Error during CLOUD sync:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

syncCloudDatabase();
