#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
const emailSyncService = require('./services/emailSyncService');

async function freshGmailSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🧹 FRESH GMAIL SYNC - CLEARING OLD DATA');
        console.log('=====================================\n');
        
        // Get target account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        console.log(`🎯 Target account: ${account.email}`);
        
        // Clear existing Gmail data for this account
        console.log('\n🗑️ Clearing existing Gmail data...');
        
        // Find and delete emails for this account's threads
        const threads = await Thread.find({ account: account._id });
        const threadIds = threads.map(t => t._id);
        
        const deletedEmails = await Email.deleteMany({ thread: { $in: threadIds } });
        console.log(`🗑️ Deleted ${deletedEmails.deletedCount} existing emails`);
        
        // Delete threads for this account
        const deletedThreads = await Thread.deleteMany({ account: account._id });
        console.log(`🗑️ Deleted ${deletedThreads.deletedCount} existing threads`);
        
        console.log('\n✅ Old data cleared. Starting fresh sync...');
        
        // Now do a fresh sync
        try {
            const result = await emailSyncService.syncAccountEmailsUnified(account, 100);
            
            console.log('\n🎉 FRESH SYNC COMPLETED:');
            console.log(`📥 INBOX emails: ${result.inboxCount}`);
            console.log(`📤 SENT emails: ${result.sentCount}`);
            console.log(`📊 Total emails: ${result.total}`);
            
        } catch (syncError) {
            console.error('\n❌ Fresh sync failed:', syncError.message);
        }
        
        // Verify the results
        console.log('\n🔍 VERIFICATION:');
        const newThreads = await Thread.find({ account: account._id });
        const newThreadIds = newThreads.map(t => t._id);
        const newEmails = await Email.find({ thread: { $in: newThreadIds } });
        
        console.log(`📁 New threads: ${newThreads.length}`);
        console.log(`📧 New emails: ${newEmails.length}`);
        
        if (newEmails.length > 0) {
            console.log('\n🎉 SUCCESS! Fresh emails synced:');
            newEmails.slice(0, 10).forEach((email, i) => {
                console.log(`  ${i+1}. ${email.subject} (${email.labelType})`);
            });
            
            // Show breakdown
            const inboxEmails = newEmails.filter(e => e.labelType === 'INBOX');
            const sentEmails = newEmails.filter(e => e.labelType === 'SENT');
            console.log(`\n📊 BREAKDOWN:`);
            console.log(`📥 INBOX: ${inboxEmails.length} emails`);
            console.log(`📤 SENT: ${sentEmails.length} emails`);
            console.log(`📎 With attachments: ${newEmails.filter(e => e.attachments && e.attachments.length > 0).length} emails`);
        } else {
            console.log('\n❌ FRESH SYNC FAILED: Still no emails after clearing old data');
        }
        
    } catch (error) {
        console.error('❌ Fresh sync failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the fresh sync
freshGmailSync().catch(console.error);
