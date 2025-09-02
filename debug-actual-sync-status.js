#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
const Chat = require('./db/Chat');
// Messages are embedded in Chat documents, not separate collection

async function checkActualSyncStatus() {
    try {
        console.log('🔍 CHECKING ACTUAL SYNC STATUS');
        console.log('===================================\n');
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // 1. Check all collections
        console.log('📊 DATABASE COLLECTION COUNTS:');
        const accounts = await Account.countDocuments({ deletedAt: { $exists: false } });
        const threads = await Thread.countDocuments({ deletedAt: { $exists: false } });
        const emails = await Email.countDocuments({ deletedAt: { $exists: false } });
        const chats = await Chat.countDocuments({ deletedAt: { $exists: false } });
        // Count total messages across all chats
        const allChats = await Chat.find({ deletedAt: { $exists: false } });
        const messages = allChats.reduce((total, chat) => total + (chat.messages?.length || 0), 0);
        
        console.log(`👥 Accounts: ${accounts}`);
        console.log(`📁 Threads: ${threads}`);
        console.log(`📧 Emails: ${emails}`);
        console.log(`💬 Chats: ${chats}`);
        console.log(`💭 Messages: ${messages}`);
        
        // 2. Check each account's data
        console.log('\n🔍 PER-ACCOUNT BREAKDOWN:');
        const allAccounts = await Account.find({ deletedAt: { $exists: false } });
        
        for (const account of allAccounts) {
            console.log(`\n👤 ${account.email}:`);
            
            // Gmail data
            const accountThreads = await Thread.countDocuments({ 
                account: account._id, 
                deletedAt: { $exists: false } 
            });
            
            const threadIds = await Thread.find({ account: account._id }).distinct('_id');
            const accountEmails = await Email.countDocuments({ 
                thread: { $in: threadIds },
                deletedAt: { $exists: false } 
            });
            
            console.log(`  📁 Gmail Threads: ${accountThreads}`);
            console.log(`  📧 Gmail Emails: ${accountEmails}`);
            
            // Google Chat data
            const accountChats = await Chat.countDocuments({ 
                account: account._id,
                deletedAt: { $exists: false } 
            });
            
            const accountChatsWithMessages = await Chat.find({ account: account._id });
            const accountMessages = accountChatsWithMessages.reduce((total, chat) => total + (chat.messages?.length || 0), 0);
            
            console.log(`  💬 Google Chats: ${accountChats}`);
            console.log(`  💭 Chat Messages: ${accountMessages}`);
            
            // Last sync info
            console.log(`  🕐 Last Sync: ${account.lastSync || 'Never'}`);
            
            // Show totals
            const totalData = accountEmails + accountMessages;
            console.log(`  📊 Total Data: ${totalData} items`);
            
            if (totalData === 0) {
                console.log(`  ❌ NO DATA SYNCED FOR THIS ACCOUNT!`);
            }
        }
        
        // 3. Check if there are any emails at all
        console.log('\n🔍 DETAILED EMAIL CHECK:');
        if (emails === 0) {
            console.log('❌ NO EMAILS FOUND IN DATABASE');
            console.log('This confirms that Gmail sync is not working properly.');
        } else {
            console.log(`✅ Found ${emails} emails - checking details...`);
            
            // Sample emails
            const sampleEmails = await Email.find({}).limit(5).populate('thread');
            console.log('\n📧 Sample emails:');
            for (const email of sampleEmails) {
                console.log(`  - "${email.subject}" (${email.labelType})`);
                console.log(`    Thread: ${email.thread?._id}`);
                console.log(`    Account: ${email.thread?.account}`);
            }
        }
        
        // 4. Check if there are any chats at all
        console.log('\n🔍 DETAILED CHAT CHECK:');
        if (chats === 0) {
            console.log('❌ NO CHATS FOUND IN DATABASE');
            console.log('This confirms that Google Chat sync is not working properly.');
        } else {
            console.log(`✅ Found ${chats} chats - checking details...`);
            
            // Sample chats
            const sampleChats = await Chat.find({}).limit(5).populate('account');
            console.log('\n💬 Sample chats:');
            for (const chat of sampleChats) {
                console.log(`  - "${chat.displayName}" (${chat.spaceType})`);
                console.log(`    Space: ${chat.spaceId}`);
                console.log(`    Account: ${chat.account?.email}`);
            }
        }
        
        // 5. Overall assessment
        console.log('\n🎯 SYNC STATUS ASSESSMENT:');
        if (emails === 0 && chats === 0) {
            console.log('❌ CRITICAL: NO DATA SYNCED AT ALL');
            console.log('Neither Gmail emails nor Google Chat messages have been synced.');
            console.log('This indicates a fundamental sync issue.');
        } else if (emails === 0) {
            console.log('⚠️ Gmail sync is not working (0 emails)');
            console.log(`✅ Google Chat sync is working (${messages} messages in ${chats} chats)`);
        } else if (chats === 0) {
            console.log(`✅ Gmail sync is working (${emails} emails in ${threads} threads)`);
            console.log('⚠️ Google Chat sync is not working (0 chats)');
        } else {
            console.log(`✅ Both Gmail and Google Chat sync are working`);
            console.log(`📊 Gmail: ${emails} emails in ${threads} threads`);
            console.log(`📊 Google Chat: ${messages} messages in ${chats} chats`);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the debug
checkActualSyncStatus().catch(console.error);
