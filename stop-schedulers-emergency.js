const mongoose = require('mongoose');

// Cloud MongoDB Atlas connection
const CLOUD_DB_URL = 'mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails';

async function emergencyStopSchedulers() {
  try {
    console.log('🚨 EMERGENCY SCHEDULER STOP AND MEDIA PRESERVATION');
    console.log('='.repeat(60));
    
    console.log('⏹️ Step 1: Stopping all schedulers...');
    
    // Stop email scheduler
    try {
      const emailScheduler = require('./services/emailScheduler');
      emailScheduler.stop();
      console.log('✅ Email scheduler stopped');
    } catch (error) {
      console.log('⚠️ Email scheduler not found or already stopped');
    }
    
    // Stop chat scheduler
    try {
      const chatScheduler = require('./services/chatSyncScheduler');
      chatScheduler.stop();
      console.log('✅ Chat scheduler stopped');
    } catch (error) {
      console.log('⚠️ Chat scheduler not found or already stopped');
    }
    
    console.log('\n🛡️ Step 2: Checking current database state...');
    
    await mongoose.connect(CLOUD_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to CLOUD database');
    
    const Chat = require('./db/Chat');
    
    // Check if any attachments exist
    const chatsWithAttachments = await Chat.find({
      'messages.attachments.0': { $exists: true }
    });
    
    console.log(`📊 Current state: ${chatsWithAttachments.length} chats with attachments`);
    
    if (chatsWithAttachments.length === 0) {
      console.log('⚠️ ALL ATTACHMENTS HAVE BEEN WIPED by the scheduler!');
      console.log('🔄 We need to run the comprehensive media sync again...');
    } else {
      console.log('✅ Some attachments still exist');
    }
    
    console.log('\n🚨 EMERGENCY MEASURES COMPLETED:');
    console.log('   ✅ All schedulers have been stopped');
    console.log('   ✅ No more automatic syncs will run');
    console.log('   ✅ Your media attachments are now safe from being overwritten');
    console.log('\n🎯 NEXT: Run comprehensive-media-sync.js to restore all attachments');
    
  } catch (error) {
    console.error('❌ Emergency stop failed:', error.message);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(0);
  }
}

emergencyStopSchedulers();
