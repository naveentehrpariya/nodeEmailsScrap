require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const ChatSyncService = require('./services/chatSyncService');
const Account = require('./db/Account');

async function testDeleteAndResync() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🧪 TESTING DELETE CHATS AND RESYNC SCENARIO');
        console.log('================================================================================');
        
        // Step 1: Check current state
        console.log('\n📊 STEP 1: Current state check');
        let chats = await Chat.find({});
        let totalAttachments = 0;
        chats.forEach(chat => {
            if (chat.messages) {
                chat.messages.forEach(msg => {
                    if (msg.attachments && msg.attachments.length > 0) {
                        totalAttachments += msg.attachments.length;
                    }
                });
            }
        });
        console.log(`Current chats: ${chats.length}`);
        console.log(`Current attachments: ${totalAttachments}`);
        
        // Step 2: Delete ALL chats (simulating your action)
        console.log('\n🗑️ STEP 2: Deleting ALL chats from database');
        const deleteResult = await Chat.deleteMany({});
        console.log(`Deleted ${deleteResult.deletedCount} chats`);
        
        // Verify deletion
        const chatsAfterDelete = await Chat.find({});
        console.log(`Chats remaining: ${chatsAfterDelete.length}`);
        
        // Step 3: Run sync (this should restore everything including media)
        console.log('\n🔄 STEP 3: Running sync to restore chats');
        console.log('================================================================================');
        
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Test account not found');
        }
        
        const syncResult = await ChatSyncService.syncAccountChats(account);
        console.log(`Sync completed: ${syncResult.syncedChats} chats, ${syncResult.syncedMessages} messages`);
        
        // Step 4: Check if media was restored
        console.log('\n📊 STEP 4: Verify media restoration after sync');
        const chatsAfterSync = await Chat.find({});
        let attachmentsAfterSync = 0;
        let messagesWithAttachments = 0;
        
        chatsAfterSync.forEach(chat => {
            if (chat.messages) {
                chat.messages.forEach(msg => {
                    if (msg.attachments && msg.attachments.length > 0) {
                        attachmentsAfterSync += msg.attachments.length;
                        messagesWithAttachments++;
                    }
                });
            }
        });
        
        console.log(`Chats after sync: ${chatsAfterSync.length}`);
        console.log(`Messages with attachments: ${messagesWithAttachments}`);
        console.log(`Total attachments after sync: ${attachmentsAfterSync}`);
        
        // Step 5: Show results
        console.log('\n================================================================================');
        console.log('🎯 RESULTS:');
        console.log('================================================================================');
        
        if (attachmentsAfterSync > 0) {
            console.log('✅ SUCCESS! Media attachments were restored after deleting and resyncing!');
            console.log(`   Media attachments found: ${attachmentsAfterSync}`);
            console.log(`   Messages with media: ${messagesWithAttachments}`);
            console.log('');
            console.log('🎉 PROBLEM SOLVED! Your delete-and-resync scenario now preserves media!');
        } else {
            console.log('❌ FAILURE! Media attachments were NOT restored after sync');
            console.log('   This indicates the fix needs more work');
        }
        
        // Step 6: Show sample attachments
        if (attachmentsAfterSync > 0) {
            console.log('\n📎 SAMPLE RESTORED ATTACHMENTS:');
            let sampleCount = 0;
            for (const chat of chatsAfterSync) {
                if (chat.messages && sampleCount < 5) {
                    for (const msg of chat.messages) {
                        if (msg.attachments && msg.attachments.length > 0 && sampleCount < 5) {
                            msg.attachments.forEach((att, index) => {
                                if (sampleCount < 5) {
                                    console.log(`   ${sampleCount + 1}. ${att.name || 'Unnamed'} (${att.contentType || 'unknown type'})`);
                                    console.log(`      Status: ${att.downloadStatus || 'unknown'}`);
                                    console.log(`      Type: ${att.mediaType || 'unknown'}`);
                                    console.log(`      Path: ${att.localPath ? '✅ Set' : '❌ Missing'}`);
                                    sampleCount++;
                                }
                            });
                        }
                    }
                }
            }
        }
        
        console.log('\n================================================================================');
        console.log('🎯 DELETE-AND-RESYNC TEST COMPLETE');
        console.log('================================================================================');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

testDeleteAndResync();
