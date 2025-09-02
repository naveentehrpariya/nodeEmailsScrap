#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
const emailSyncService = require('./services/emailSyncService');

async function debugGmailSync() {
    try {
        console.log('🔧 GMAIL SYNC DEBUGGING TOOL');
        console.log('=====================================\n');
        
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // 1. Check accounts in database
        console.log('📋 CHECKING ACCOUNTS:');
        const accounts = await Account.find({ deletedAt: { $exists: false } });
        console.log(`Found ${accounts.length} accounts:`);
        
        for (const account of accounts) {
            console.log(`  - ${account.email} (ID: ${account._id})`);
            console.log(`    Last sync: ${account.lastSync || 'Never'}`);
            
            // Check domain restrictions
            const domain = account.email.split('@')[1];
            const unsupportedDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com'];
            const isBlocked = unsupportedDomains.includes(domain.toLowerCase());
            console.log(`    Domain: ${domain} ${isBlocked ? '❌ BLOCKED by emailSyncService' : '✅ Allowed'}`);
        }
        console.log('');
        
        // 2. Check Gmail threads and emails in database
        console.log('📧 CHECKING GMAIL EMAILS IN DATABASE:');
        
        for (const account of accounts) {
            console.log(`\n👤 Account: ${account.email}`);
            
            // Count threads for this account
            const threadCount = await Thread.countDocuments({
                account: account._id,
                deletedAt: { $exists: false }
            });
            console.log(`  Threads: ${threadCount}`);
            
            // Count emails by type
            const inboxCount = await Email.countDocuments({
                thread: { $in: await Thread.find({ account: account._id }).distinct('_id') },
                labelType: 'INBOX',
                deletedAt: { $exists: false }
            });
            
            const sentCount = await Email.countDocuments({
                thread: { $in: await Thread.find({ account: account._id }).distinct('_id') },
                labelType: 'SENT',
                deletedAt: { $exists: false }
            });
            
            console.log(`  INBOX emails: ${inboxCount}`);
            console.log(`  SENT emails: ${sentCount}`);
            console.log(`  Total Gmail emails: ${inboxCount + sentCount}`);
            
            // Show recent threads
            if (threadCount > 0) {
                const recentThreads = await Thread.find({
                    account: account._id,
                    deletedAt: { $exists: false }
                }).sort({ createdAt: -1 }).limit(5);
                
                console.log(`  Recent threads:`);
                for (const thread of recentThreads) {
                    console.log(`    - "${thread.subject}" (${thread.threadId})`);
                }
            }
        }
        
        // 3. Test Gmail sync capability
        console.log('\n🧪 TESTING GMAIL SYNC CAPABILITY:');
        
        for (const account of accounts) {
            console.log(`\nTesting sync for: ${account.email}`);
            
            const domain = account.email.split('@')[1];
            const unsupportedDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com'];
            
            if (unsupportedDomains.includes(domain.toLowerCase())) {
                console.log(`❌ SYNC BLOCKED: Domain ${domain} is in unsupported domains list`);
                console.log(`   The emailSyncService explicitly blocks personal email domains.`);
                console.log(`   This account needs OAuth2 authentication, not service account delegation.`);
                continue;
            }
            
            try {
                console.log(`🔄 Attempting to create Gmail client for ${account.email}...`);
                const gmail = emailSyncService.createGmailClient(account.email);
                console.log(`✅ Gmail client created successfully`);
                
                // Try to list a few messages
                console.log(`📥 Testing message listing...`);
                const response = await gmail.users.messages.list({
                    userId: "me",
                    labelIds: ['INBOX'],
                    maxResults: 5
                });
                
                const messages = response.data.messages || [];
                console.log(`✅ Found ${messages.length} INBOX messages`);
                
                if (messages.length > 0) {
                    console.log(`📧 Sample message IDs: ${messages.map(m => m.id).join(', ')}`);
                }
                
            } catch (error) {
                console.log(`❌ Gmail sync test failed: ${error.message}`);
                
                if (error.message.includes('unauthorized_client')) {
                    console.log(`🔧 This indicates domain-wide delegation is not configured.`);
                    console.log(`   Check OAUTH_SETUP.md for setup instructions.`);
                } else if (error.message.includes('Domain delegation')) {
                    console.log(`🔧 Domain-wide delegation is required for ${domain}`);
                }
            }
        }
        
        // 4. Check sync service configuration
        console.log('\n⚙️  SYNC SERVICE CONFIGURATION:');
        console.log('Email Sync Service domain restrictions:');
        console.log('  Blocked domains: gmail.com, googlemail.com, yahoo.com, hotmail.com, outlook.com, live.com');
        console.log('  These domains require OAuth2 flow instead of service account delegation.');
        
        // 5. Check if there are any manual sync attempts in logs
        console.log('\n📊 SYNC SUMMARY:');
        let totalGmailEmails = 0;
        let totalGmailThreads = 0;
        
        for (const account of accounts) {
            const threads = await Thread.countDocuments({
                account: account._id,
                deletedAt: { $exists: false }
            });
            
            const emails = await Email.countDocuments({
                thread: { $in: await Thread.find({ account: account._id }).distinct('_id') },
                deletedAt: { $exists: false }
            });
            
            totalGmailThreads += threads;
            totalGmailEmails += emails;
        }
        
        console.log(`Total Gmail threads across all accounts: ${totalGmailThreads}`);
        console.log(`Total Gmail emails across all accounts: ${totalGmailEmails}`);
        
        if (totalGmailEmails === 0) {
            console.log('\n🚨 NO GMAIL EMAILS FOUND IN DATABASE');
            console.log('Possible reasons:');
            console.log('1. Domain restrictions blocking sync');
            console.log('2. OAuth/authentication not properly configured');
            console.log('3. Manual sync has never been run');
            console.log('4. Account emails are stored in a different collection');
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the debug
debugGmailSync().catch(console.error);
