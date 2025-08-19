const mongoose = require('mongoose');
const chatSyncService = require('./services/chatSyncService');

async function syncCMCSpace() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
        // Run sync for all accounts (this will include CMC space)
        console.log('Starting chat sync for all accounts...');
        const results = await chatSyncService.syncAllAccountChats();
        
        console.log('\n=== SYNC RESULTS ===');
        results.forEach(result => {
            console.log(`Account: ${result.email}`);
            console.log(`  Success: ${result.success}`);
            console.log(`  Synced Chats: ${result.syncedChats || 0}`);
            console.log(`  Synced Messages: ${result.syncedMessages || 0}`);
            if (result.error) {
                console.log(`  Error: ${result.error}`);
            }
            console.log('');
        });
        
        // Check CMC space after sync
        const Chat = require('./db/Chat');
        const cmcChat = await Chat.findOne({ displayName: /CMC/i });
        
        if (cmcChat) {
            console.log('\n=== CMC SPACE AFTER SYNC ===');
            console.log(`Messages: ${cmcChat.messageCount}`);
            
            const messagesWithAttachments = cmcChat.messages.filter(msg => 
                msg.attachments && msg.attachments.length > 0
            );
            console.log(`Messages with attachments: ${messagesWithAttachments.length}`);
            
            if (messagesWithAttachments.length > 0) {
                console.log('\nAttachment details:');
                messagesWithAttachments.forEach((msg, i) => {
                    console.log(`  Message ${i + 1}: "${(msg.text || '(no text)').substring(0, 50)}..."`);
                    console.log(`    Attachments: ${msg.attachments.length}`);
                    msg.attachments.forEach((att, j) => {
                        console.log(`      ${j + 1}. ${att.name} (${att.mimeType})`);
                        console.log(`         Local: ${att.localPath || 'not downloaded'}`);
                        console.log(`         Status: ${att.downloadStatus || 'unknown'}`);
                    });
                });
            }
        } else {
            console.log('\nCMC space not found after sync');
        }
        
    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the sync
syncCMCSpace();
