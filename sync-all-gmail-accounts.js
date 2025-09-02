#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const emailSyncService = require('./services/emailSyncService');

async function syncAllGmailAccounts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🚀 SYNC ALL GMAIL ACCOUNTS');
        console.log('============================\n');
        
        console.log('🔄 Starting unified Gmail sync for all accounts...');
        
        // Use the email sync service to sync all accounts
        const results = await emailSyncService.syncAllAccounts();
        
        console.log('\n🏁 FINAL RESULTS:');
        console.log('==================');
        
        let totalEmails = 0;
        let successfulAccounts = 0;
        let failedAccounts = 0;
        
        results.forEach(result => {
            if (result.success) {
                console.log(`✅ ${result.account}:`);
                console.log(`   📥 INBOX: ${result.inboxCount} emails`);  
                console.log(`   📤 SENT: ${result.sentCount} emails`);
                console.log(`   📊 Total: ${result.total} emails`);
                totalEmails += result.total;
                successfulAccounts++;
            } else {
                console.log(`❌ ${result.account}: ${result.error}`);
                failedAccounts++;
            }
        });
        
        console.log('\n📊 SUMMARY:');
        console.log(`✅ Successful accounts: ${successfulAccounts}`);
        console.log(`❌ Failed accounts: ${failedAccounts}`);
        console.log(`📧 Total emails synced: ${totalEmails}`);
        
        if (successfulAccounts > 0) {
            console.log('\n🎉 Gmail sync is now working across multiple accounts!');
        } else {
            console.log('\n⚠️ No accounts were successfully synced. Check the individual errors above.');
        }
        
    } catch (error) {
        console.error('❌ Sync all accounts failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the sync
syncAllGmailAccounts().catch(console.error);
