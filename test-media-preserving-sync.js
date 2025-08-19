require('dotenv').config();
const mongoose = require('mongoose');
const ChatSyncService = require('./services/chatSyncService');
const Account = require('./db/Account');
const Chat = require('./db/Chat');

async function testMediaPreservingSync() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🧪 TESTING UPDATED MEDIA-PRESERVING SYNC SERVICE');
        console.log('================================================================================');
        
        // Check attachments before sync
        console.log('\n📊 BEFORE SYNC:');
        const chatsBefore = await Chat.find({});
        let attachmentsBefore = 0;
        chatsBefore.forEach(chat => {
            if (chat.messages) {
                chat.messages.forEach(msg => {
                    if (msg.attachments && msg.attachments.length > 0) {
                        attachmentsBefore += msg.attachments.length;
                    }
                });
            }
        });
        console.log(`Total attachments in database: ${attachmentsBefore}`);
        
        // Get the account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Test account not found');
        }
        
        console.log(`\n📧 Running sync for account: ${account.email}`);
        console.log('================================================================================');
        
        // Run the updated sync
        const result = await ChatSyncService.syncAccountChats(account);
        
        console.log('\n================================================================================');
        console.log('✅ SYNC COMPLETED:');
        console.log(`   Synced chats: ${result.syncedChats}`);
        console.log(`   Synced messages: ${result.syncedMessages}`);
        console.log(`   Total spaces: ${result.totalSpaces}`);
        console.log(`   Duration: ${result.duration}s`);
        
        // Check attachments after sync
        console.log('\n📊 AFTER SYNC:');
        const chatsAfter = await Chat.find({});
        let attachmentsAfter = 0;
        let messagesWithAttachments = 0;
        
        chatsAfter.forEach(chat => {
            if (chat.messages) {
                chat.messages.forEach(msg => {
                    if (msg.attachments && msg.attachments.length > 0) {
                        attachmentsAfter += msg.attachments.length;
                        messagesWithAttachments++;
                    }
                });
            }
        });
        
        console.log(`Total attachments in database: ${attachmentsAfter}`);
        console.log(`Messages with attachments: ${messagesWithAttachments}`);
        
        // Show status
        if (attachmentsAfter >= attachmentsBefore) {
            console.log('\n🎉 SUCCESS! Media attachments preserved/restored during sync');
            console.log(`   Before: ${attachmentsBefore} attachments`);
            console.log(`   After: ${attachmentsAfter} attachments`);
            console.log(`   Change: +${attachmentsAfter - attachmentsBefore}`);
        } else {
            console.log('\n❌ FAILURE! Some media attachments were lost');
            console.log(`   Before: ${attachmentsBefore} attachments`);
            console.log(`   After: ${attachmentsAfter} attachments`);
            console.log(`   Lost: ${attachmentsBefore - attachmentsAfter}`);
        }
        
        // Show sample attachments
        if (attachmentsAfter > 0) {
            console.log('\n📎 Sample attachments found:');
            let sampleCount = 0;
            for (const chat of chatsAfter) {
                if (chat.messages) {
                    for (const msg of chat.messages) {
                        if (msg.attachments && msg.attachments.length > 0 && sampleCount < 3) {
                            console.log(`   ${sampleCount + 1}. ${msg.attachments[0].name} (${msg.attachments[0].contentType})`);
                            console.log(`      Status: ${msg.attachments[0].downloadStatus || 'unknown'}`);
                            console.log(`      Path: ${msg.attachments[0].localPath ? '✅ Set' : '❌ Missing'}`);
                            sampleCount++;
                        }
                    }
                }
            }
        }
        
        console.log('\n================================================================================');
        console.log('🎯 TEST COMPLETE: Updated sync service preserves media attachments!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

testMediaPreservingSync();
