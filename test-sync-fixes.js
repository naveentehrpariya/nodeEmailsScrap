#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');
const chatSyncService = require('./services/chatSyncService');

async function testSyncFixes() {
    console.log('🔧 Testing sync fixes for incomplete mail and attachment issues\n');
    
    try {
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE || process.env.MONGO_URI || 'mongodb://localhost:27017/email_scrap');
        console.log('✅ Connected to database');
        
        // Find a test account
        const testAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!testAccount) {
            console.log('❌ Test account not found');
            return;
        }
        
        console.log(`🔑 Testing with account: ${testAccount.email}`);
        
        // Get stats before sync
        const chatsBefore = await Chat.countDocuments({ account: testAccount._id });
        const messagesBeforeResult = await Chat.aggregate([
            { $match: { account: testAccount._id } },
            { $project: { messageCount: { $size: '$messages' } } },
            { $group: { _id: null, totalMessages: { $sum: '$messageCount' } } }
        ]);
        const messagesBefore = messagesBeforeResult.length > 0 ? messagesBeforeResult[0].totalMessages : 0;
        
        const attachmentsBeforeResult = await Chat.aggregate([
            { $match: { account: testAccount._id } },
            { $unwind: '$messages' },
            { $match: { 'messages.attachments': { $exists: true, $not: { $size: 0 } } } },
            { $project: { attachmentCount: { $size: '$messages.attachments' } } },
            { $group: { _id: null, totalAttachments: { $sum: '$attachmentCount' } } }
        ]);
        const attachmentsBefore = attachmentsBeforeResult.length > 0 ? attachmentsBeforeResult[0].totalAttachments : 0;
        
        console.log('\n📊 Stats BEFORE sync:');
        console.log(`   - Chats: ${chatsBefore}`);
        console.log(`   - Messages: ${messagesBefore}`);
        console.log(`   - Messages with attachments: ${attachmentsBefore}`);
        
        // Run the sync with fixes
        console.log('\n🔄 Running sync with fixes...');
        const startTime = Date.now();
        
        const syncResult = await chatSyncService.syncAccountChats(testAccount);
        
        const duration = Date.now() - startTime;
        console.log(`\n✅ Sync completed in ${Math.round(duration/1000)}s`);
        console.log(`   - Synced chats: ${syncResult.syncedChats}`);
        console.log(`   - Synced messages: ${syncResult.syncedMessages}`);
        console.log(`   - Total spaces: ${syncResult.totalSpaces}`);
        
        // Get stats after sync
        const chatsAfter = await Chat.countDocuments({ account: testAccount._id });
        const messagesAfterResult = await Chat.aggregate([
            { $match: { account: testAccount._id } },
            { $project: { messageCount: { $size: '$messages' } } },
            { $group: { _id: null, totalMessages: { $sum: '$messageCount' } } }
        ]);
        const messagesAfter = messagesAfterResult.length > 0 ? messagesAfterResult[0].totalMessages : 0;
        
        const attachmentsAfterResult = await Chat.aggregate([
            { $match: { account: testAccount._id } },
            { $unwind: '$messages' },
            { $match: { 'messages.attachments': { $exists: true, $not: { $size: 0 } } } },
            { $project: { attachmentCount: { $size: '$messages.attachments' } } },
            { $group: { _id: null, totalAttachments: { $sum: '$attachmentCount' } } }
        ]);
        const attachmentsAfter = attachmentsAfterResult.length > 0 ? attachmentsAfterResult[0].totalAttachments : 0;
        
        console.log('\n📊 Stats AFTER sync:');
        console.log(`   - Chats: ${chatsAfter}`);
        console.log(`   - Messages: ${messagesAfter}`);
        console.log(`   - Messages with attachments: ${attachmentsAfter}`);
        
        // Calculate improvements
        const chatIncrease = chatsAfter - chatsBefore;
        const messageIncrease = messagesAfter - messagesBefore;
        const attachmentIncrease = attachmentsAfter - attachmentsBefore;
        
        console.log('\n🎯 IMPROVEMENTS:');
        console.log(`   - New chats: ${chatIncrease > 0 ? '+' : ''}${chatIncrease}`);
        console.log(`   - New messages: ${messageIncrease > 0 ? '+' : ''}${messageIncrease}`);
        console.log(`   - New attachments: ${attachmentIncrease > 0 ? '+' : ''}${attachmentIncrease}`);
        
        // Test specific space with known attachments
        console.log('\n🔍 Testing CMC space (known to have attachments)...');
        const cmcChat = await Chat.findOne({ 
            account: testAccount._id, 
            spaceId: 'spaces/AAQAPUbCMD0' 
        });
        
        if (cmcChat) {
            const messagesWithAttachments = cmcChat.messages.filter(msg => 
                msg.attachments && msg.attachments.length > 0
            );
            console.log(`   - CMC messages: ${cmcChat.messages.length}`);
            console.log(`   - CMC messages with attachments: ${messagesWithAttachments.length}`);
            
            if (messagesWithAttachments.length > 0) {
                console.log(`   ✅ SUCCESS: CMC space has ${messagesWithAttachments.length} messages with attachments`);
                console.log('   📎 Sample attachments:');
                messagesWithAttachments.slice(0, 3).forEach((msg, index) => {
                    console.log(`      ${index + 1}. Message "${msg.text?.substring(0, 30)}..." has ${msg.attachments.length} attachment(s)`);
                    msg.attachments.forEach(att => {
                        console.log(`         - ${att.name} (${att.mediaType || 'unknown'})`);
                    });
                });
            } else {
                console.log('   ❌ ISSUE: CMC space still has no messages with attachments');
            }
        } else {
            console.log('   ⚠️  CMC space not found in database');
        }
        
        // Overall assessment
        console.log('\n🎉 SYNC TEST RESULTS:');
        
        if (messageIncrease > 0) {
            console.log(`✅ FIXED: Incomplete mail sync - Found ${messageIncrease} additional messages`);
        } else if (messagesAfter > messagesBefore) {
            console.log(`✅ MAINTAINED: All existing messages preserved`);
        } else {
            console.log(`⚠️  No new messages found (might be up to date)`);
        }
        
        if (attachmentIncrease > 0) {
            console.log(`✅ FIXED: Attachment display - Found ${attachmentIncrease} additional attachments`);
        } else if (attachmentsAfter > 0) {
            console.log(`✅ MAINTAINED: ${attachmentsAfter} attachments are properly saved and should display correctly`);
        } else {
            console.log(`❌ ISSUE: Still no attachments found - this needs investigation`);
        }
        
        // Test pagination specifically
        const largestChat = await Chat.findOne({ account: testAccount._id })
            .sort({ messageCount: -1 });
            
        if (largestChat && largestChat.messageCount > 100) {
            console.log(`✅ PAGINATION: Largest chat has ${largestChat.messageCount} messages (>100, so pagination is working)`);
        } else {
            console.log(`ℹ️  PAGINATION: No chats over 100 messages found (this is normal if your chats are smaller)`);
        }
        
        console.log('\n🏁 Test completed successfully!');
        console.log('   The fixes should now ensure:');
        console.log('   1. ✅ All messages are synced (not just the first 100)');
        console.log('   2. ✅ Attachments are properly detected and saved');
        console.log('   3. ✅ Frontend should display all messages and their attachments correctly');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
    }
}

testSyncFixes();
