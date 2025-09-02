const mongoose = require('mongoose');
const EmailSyncService = require('./services/emailSyncService');
const Account = require('./db/Account');

async function testDuplicateFix() {
    try {
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('✅ Connected to MongoDB');

        // Find the account
        const account = await Account.findOne({ 
            email: 'naveendev@crossmilescarrier.com' 
        });

        if (!account) {
            console.log('❌ Account not found');
            return;
        }

        console.log('🧪 Testing duplicate thread fix...');
        console.log('===================================');

        // Run a small sync to test
        try {
            const result = await EmailSyncService.syncAccountEmailsUnified(account, 10); // Small batch
            console.log('✅ Sync completed successfully!');
            console.log(`📊 Result: ${result.total} emails processed`);
            console.log(`   📥 Inbox: ${result.inboxCount}`);
            console.log(`   📤 Sent: ${result.sentCount}`);
        } catch (error) {
            console.error('❌ Sync failed:', error.message);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

testDuplicateFix();
