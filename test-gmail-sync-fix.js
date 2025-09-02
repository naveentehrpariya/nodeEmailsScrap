#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const emailSyncService = require('./services/emailSyncService');

async function testGmailSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Get the main account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        console.log(`🎯 Testing Gmail sync for: ${account.email}`);
        
        console.log('\n🔄 Running Gmail sync with increased limit...');
        
        // Test sync with more messages
        try {
            const result = await emailSyncService.syncAccountEmailsUnified(account, 200); // Increase from default 100
            
            console.log('\n📊 SYNC RESULTS:');
            console.log(`✅ INBOX messages processed: ${result.inboxCount}`);
            console.log(`✅ SENT messages processed: ${result.sentCount}`);
            console.log(`✅ Total messages processed: ${result.total}`);
            
        } catch (syncError) {
            console.error('❌ Gmail sync failed:', syncError.message);
            
            // Try to diagnose the issue
            if (syncError.message.includes('validation failed')) {
                console.log('\n🔧 This appears to be a validation error.');
                console.log('Check if the Email model validation is causing issues.');
            } else if (syncError.message.includes('unauthorized')) {
                console.log('\n🔧 This appears to be an authentication error.');
                console.log('Check OAuth/domain delegation configuration.');
            } else {
                console.log('\n🔧 Unexpected error during sync.');
                console.error('Full error:', syncError);
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the test
testGmailSync().catch(console.error);
