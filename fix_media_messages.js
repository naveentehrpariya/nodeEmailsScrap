require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
const { google } = require('googleapis');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

async function fixMediaMessages() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🔄 Re-syncing messages to fix media attachments...\n');
        
        // Get the first account for user email
        const account = await Account.findOne();
        if (!account) {
            console.error('❌ No account found. Please add a Google account first.');
            return;
        }
        
        console.log(`Using account: ${account.email}`);
        
        // Set up Google Chat API client using dispatch.json (same as chatSyncService)
        const SCOPES = [
            'https://www.googleapis.com/auth/chat.spaces.readonly',
            'https://www.googleapis.com/auth/chat.messages.readonly',
            'https://www.googleapis.com/auth/chat.media.readonly',
            'https://www.googleapis.com/auth/drive.readonly'
        ];
        
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            account.email
        );
        
        const chat = google.chat({ version: 'v1', auth });
        
        // Get all chats and find messages with no text (potential media messages)
        const chats = await Chat.find({});
        
        for (const chatDoc of chats) {
            console.log(`\n📂 Checking chat: ${chatDoc.displayName}`);
            
            const noTextMessages = chatDoc.messages.filter(msg => 
                (!msg.text || msg.text.trim() === '' || msg.text === '(no text)') &&
                msg.messageId.startsWith('spaces/') // Real Google Chat messages
            );
            
            if (noTextMessages.length === 0) {
                console.log('   No messages to check');
                continue;
            }
            
            console.log(`   Found ${noTextMessages.length} messages with no text to re-sync`);
            
            let fixedCount = 0;
            
            for (const msg of noTextMessages.slice(0, 3)) { // Limit to first 3 for testing
                try {
                    console.log(`   Fetching details for: ${msg.messageId}`);
                    
                    // Fetch full message details from Google Chat API
                    const fullMessage = await chat.spaces.messages.get({
                        name: msg.messageId
                    });
                    
                    const messageData = fullMessage.data;
                    console.log(`     Text: "${messageData.text || '(no text)'}"`);
                    console.log(`     Attachments: ${messageData.attachments ? messageData.attachments.length : 0}`);
                    
                    if (messageData.attachments && messageData.attachments.length > 0) {
                        console.log('     Processing attachments...');
                        
                        // Process attachments using the media service
                        const processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(messageData, auth);
                        
                        // Update the message in the database
                        msg.attachments = processedAttachments;
                        if (messageData.text) {
                            msg.text = messageData.text;
                        }
                        
                        fixedCount++;
                        console.log(`     ✅ Fixed message with ${processedAttachments.length} attachments`);
                        
                        // Log attachment details
                        processedAttachments.forEach((att, i) => {
                            console.log(`       [${i}] ${att.filename} (${att.mediaType}) - ${att.downloadStatus}`);
                        });
                    } else {
                        console.log('     No attachments found in API response');
                    }
                    
                } catch (error) {
                    console.error(`     ❌ Error processing ${msg.messageId}:`, error.message);
                }
            }
            
            if (fixedCount > 0) {
                await chatDoc.save();
                console.log(`   💾 Saved ${fixedCount} fixed messages for ${chatDoc.displayName}`);
            }
        }
        
        console.log('\n✅ Media message fix complete!');
        
        // Now test the API to see results
        console.log('\n🧪 Testing updated messages...');
        const updatedChats = await Chat.find({});
        let totalMediaMessages = 0;
        
        for (const chat of updatedChats) {
            const mediaMessages = chat.messages.filter(msg => 
                msg.attachments && msg.attachments.length > 0
            );
            
            if (mediaMessages.length > 0) {
                console.log(`${chat.displayName}: ${mediaMessages.length} messages with media`);
                totalMediaMessages += mediaMessages.length;
            }
        }
        
        console.log(`\nTotal messages with media: ${totalMediaMessages}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixMediaMessages();
