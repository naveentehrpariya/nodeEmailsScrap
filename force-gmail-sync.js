#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const emailSyncService = require('./services/emailSyncService');

async function forceGmailSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔧 FORCE GMAIL SYNC - BYPASSING DUPLICATES');
        console.log('==========================================\n');
        
        // Get target account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        console.log(`🎯 Target account: ${account.email}`);
        
        console.log('\n🔄 Starting Gmail sync...');
        try {
            // Try the unified sync method with higher limits
            const result = await emailSyncService.syncAccountEmailsUnified(account, 500);
            
            console.log('\n✅ GMAIL SYNC COMPLETED:');
            console.log(`📥 INBOX emails: ${result.inboxCount}`);
            console.log(`📤 SENT emails: ${result.sentCount}`);
            console.log(`📊 Total emails: ${result.total}`);
            
        } catch (syncError) {
            console.error('\n❌ Gmail sync failed:', syncError.message);
            
            // If unified sync fails, try individual INBOX sync
            console.log('\n🔄 Trying INBOX-only sync...');
            try {
                const inboxResult = await emailSyncService.syncAccountEmails(account, 'INBOX', 200);
                console.log(`✅ INBOX sync: ${inboxResult.length} emails processed`);
            } catch (inboxError) {
                console.error('❌ INBOX sync also failed:', inboxError.message);
            }
        }
        
        // Verify results
        console.log('\n🔍 POST-SYNC VERIFICATION:');
        const Email = require('./db/Email');
        const Thread = require('./db/Thread');
        
        const threads = await Thread.find({ account: account._id });
        const threadIds = threads.map(t => t._id);
        const emails = await Email.find({ thread: { $in: threadIds } });
        
        console.log(`📁 Threads: ${threads.length}`);
        console.log(`📧 Emails: ${emails.length}`);
        
        if (emails.length > 0) {
            console.log('\n🎉 SUCCESS! Emails are now synced:');
            emails.slice(0, 5).forEach((email, i) => {
                console.log(`  ${i+1}. ${email.subject} (${email.labelType})`);
            });
        } else {
            console.log('\n❌ SYNC FAILED: Still no emails in database');
            console.log('The duplicate detection might be preventing all emails from being saved.');
        }
        
    } catch (error) {
        console.error('❌ Force sync failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the force sync
forceGmailSync().catch(console.error);
