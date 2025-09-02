#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
const emailSyncService = require('./services/emailSyncService');

async function clearAllAndFreshSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🧹 NUCLEAR OPTION - CLEAR ALL EMAILS GLOBALLY');
        console.log('===============================================\n');
        
        // Get target account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        console.log(`🎯 Target account: ${account.email}`);
        
        console.log('\n🗑️ Clearing ALL emails and threads globally...');
        
        // Delete ALL emails in the database
        const deletedEmails = await Email.deleteMany({});
        console.log(`🗑️ Deleted ${deletedEmails.deletedCount} emails globally`);
        
        // Delete ALL threads in the database  
        const deletedThreads = await Thread.deleteMany({});
        console.log(`🗑️ Deleted ${deletedThreads.deletedCount} threads globally`);
        
        console.log('\\n✅ Database cleared completely. Starting fresh sync...');
        
        // Now do a completely fresh sync
        try {
            const result = await emailSyncService.syncAccountEmailsUnified(account, 100);
            
            console.log('\\n🎉 FRESH SYNC COMPLETED:');
            console.log(`📥 INBOX emails: ${result.inboxCount}`);
            console.log(`📤 SENT emails: ${result.sentCount}`);
            console.log(`📊 Total emails: ${result.total}`);
            
        } catch (syncError) {
            console.error('\\n❌ Fresh sync failed:', syncError.message);
        }
        
        // Verify the results
        console.log('\\n🔍 VERIFICATION:');
        const newThreads = await Thread.find({});
        const newEmails = await Email.find({});
        
        console.log(`📁 New threads: ${newThreads.length}`);
        console.log(`📧 New emails: ${newEmails.length}`);
        
        if (newEmails.length > 0) {
            console.log('\\n🎉 SUCCESS! Fresh emails synced:');
            newEmails.forEach((email, i) => {
                console.log(`  ${i+1}. ${email.subject} (${email.labelType})`);
            });
            
            // Show breakdown
            const inboxEmails = newEmails.filter(e => e.labelType === 'INBOX');
            const sentEmails = newEmails.filter(e => e.labelType === 'SENT');
            console.log(`\\n📊 BREAKDOWN:`);
            console.log(`📥 INBOX: ${inboxEmails.length} emails`);
            console.log(`📤 SENT: ${sentEmails.length} emails`);
            console.log(`📎 With attachments: ${newEmails.filter(e => e.attachments && e.attachments.length > 0).length} emails`);
            
            if (newEmails.length === 21) {
                console.log('\\n🎉 PERFECT! All 21 emails were synced successfully!');
                console.log('✅ Gmail sync is now working correctly!');
            } else {
                console.log(`\\n⚠️ Expected 21 emails but got ${newEmails.length}. Some emails might still have issues.`);
            }
            
        } else {
            console.log('\\n❌ FAILURE: Still no emails after complete database clear');
            console.log('This indicates a fundamental issue with the Gmail sync logic.');
        }
        
    } catch (error) {
        console.error('❌ Clear and sync failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\\n✅ Disconnected from MongoDB');
    }
}

// Run the nuclear option
clearAllAndFreshSync().catch(console.error);
