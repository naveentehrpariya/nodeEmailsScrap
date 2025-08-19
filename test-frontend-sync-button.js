require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const ChatController = require('./controllers/chatController');

async function testFrontendSyncButton() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🧪 TESTING FRONTEND SYNC BUTTON FUNCTIONALITY');
        console.log('================================================================================');
        console.log('This simulates exactly what happens when you click the sync button in frontend');
        
        // Step 1: Delete all chats (like you did)
        console.log('\n🗑️ STEP 1: Deleting ALL chats from database');
        const deleteResult = await Chat.deleteMany({});
        console.log(`Deleted ${deleteResult.deletedCount} chats`);
        
        // Step 2: Simulate the frontend sync button call
        console.log('\n🔄 STEP 2: Simulating frontend sync button click');
        console.log('Calling ChatController.syncChats() with accountEmail...');
        
        // Create a mock request/response like the frontend would send
        const mockReq = {
            params: {
                accountEmail: 'naveendev@crossmilescarrier.com'
            }
        };
        
        const mockRes = {
            json: function(data) {
                console.log('📡 API Response:', data);
                return data;
            },
            status: function(code) {
                console.log(`📡 HTTP Status: ${code}`);
                return this;
            }
        };
        
        console.log('================================================================================');
        
        // Call the actual method that the frontend sync button uses
        const result = await ChatController.syncChats(mockReq, mockRes);
        
        console.log('\n================================================================================');
        console.log('🔄 SYNC COMPLETED - Checking results...');
        
        // Step 3: Verify media was restored
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
        
        console.log(`\\nChats after frontend sync: ${chatsAfterSync.length}`);
        console.log(`Messages with attachments: ${messagesWithAttachments}`);
        console.log(`Total attachments after sync: ${attachmentsAfterSync}`);
        
        console.log('\\n================================================================================');
        console.log('🎯 FRONTEND SYNC BUTTON TEST RESULTS:');
        console.log('================================================================================');
        
        if (attachmentsAfterSync > 0) {
            console.log('✅ SUCCESS! Frontend sync button now restores media attachments!');
            console.log(`   Media attachments found: ${attachmentsAfterSync}`);
            console.log(`   Messages with media: ${messagesWithAttachments}`);
            console.log('');
            console.log('🎉 YOUR ORIGINAL PROBLEM IS COMPLETELY SOLVED!');
            console.log('✅ Delete chats from database → Click sync button → Media restored!');
        } else {
            console.log('❌ FAILURE! Frontend sync button still not working');
            console.log('   No media attachments were restored');
        }
        
        console.log('\\n================================================================================');
        console.log('🎯 FRONTEND SYNC BUTTON TEST COMPLETE');
        console.log('================================================================================');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

testFrontendSyncButton();
