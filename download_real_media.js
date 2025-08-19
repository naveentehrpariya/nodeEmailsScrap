const mongoose = require('mongoose');
const { google } = require('googleapis');
require('dotenv').config();

const Chat = require('./db/Chat');
const Account = require('./db/Account');
const keys = require('./dispatch.json');

async function downloadRealMediaFiles() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        const mediaProcessingService = require('./services/mediaProcessingService');
        await mediaProcessingService.initialize();

        // Get all chats and filter ones with attachments
        const allChats = await Chat.find({});
        
        const chatsWithAttachments = allChats.filter(chat => {
            return chat.messages.some(msg => msg.attachments && msg.attachments.length > 0);
        });

        console.log(`Found ${chatsWithAttachments.length} chats with attachments`);

        let totalDownloaded = 0;
        let totalFailed = 0;

        for (const chat of chatsWithAttachments) {
            console.log(`\n🔄 Processing chat: ${chat._id} (${chat.displayName || 'Unnamed'})`);
            
            if (!chat.account) {
                console.log('❌ Chat has no associated account, skipping');
                continue;
            }

            // Get the account information
            const account = await Account.findById(chat.account);
            if (!account) {
                console.log('❌ Account not found, skipping');
                continue;
            }

            console.log(`   Account: ${account.email}`);

            // Set up Google Chat authentication for this account
            const SCOPES = [
                "https://www.googleapis.com/auth/chat.spaces.readonly",
                "https://www.googleapis.com/auth/chat.messages.readonly", 
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/admin.directory.user.readonly"
            ];

            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                SCOPES,
                account.email
            );

            const chatApi = google.chat({ version: 'v1', auth });

            let chatModified = false;

            for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
                const message = chat.messages[msgIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    console.log(`  📨 Processing message with ${message.attachments.length} attachments`);
                    
                    for (let attIndex = 0; attIndex < message.attachments.length; attIndex++) {
                        const attachment = message.attachments[attIndex];
                        
                        console.log(`    📎 Processing: ${attachment.name || attachment.filename || 'Unknown'}`);
                        console.log(`       Content Type: ${attachment.contentType}`);
                        console.log(`       Download Status: ${attachment.downloadStatus}`);

                        // Skip if already properly downloaded (has localPath with actual file)
                        if (attachment.localPath && attachment.downloadStatus === 'completed') {
                            try {
                                const fs = require('fs');
                                const path = require('path');
                                const filePath = path.join(__dirname, 'media', attachment.localPath);
                                
                                if (fs.existsSync(filePath)) {
                                    const fileType = require('child_process').execSync(`file "${filePath}"`, { encoding: 'utf8' });
                                    
                                    // Check if it's actually a valid file (not HTML)
                                    if (!fileType.includes('HTML document')) {
                                        console.log(`       ✅ Already downloaded and valid: ${attachment.localPath}`);
                                        continue;
                                    } else {
                                        console.log(`       🔄 File is HTML (corrupted), re-downloading...`);
                                    }
                                }
                            } catch (e) {
                                console.log(`       🔄 Error checking file, re-downloading...`);
                            }
                        }

                        try {
                            // Get the full message data to ensure we have all attachment info
                            const fullMessage = await chatApi.spaces.messages.get({
                                name: message.messageId
                            });

                            // Find the corresponding attachment in the full message
                            const fullAttachments = fullMessage.data.attachments || [];
                            let fullAttachment = fullAttachments.find(att => 
                                att.name === attachment.name || 
                                att.contentName === attachment.contentName
                            );

                            if (!fullAttachment && fullAttachments.length > 0) {
                                // Use by index if we can't match by name
                                fullAttachment = fullAttachments[attIndex] || fullAttachments[0];
                            }

                            if (fullAttachment) {
                                console.log(`       🔄 Downloading attachment...`);
                                
                                // Use the proper processAttachment method that actually downloads
                                const processedAttachment = await mediaProcessingService.processAttachment(
                                    fullAttachment, 
                                    fullMessage.data, 
                                    auth
                                );

                                // Update the attachment in the database
                                Object.assign(chat.messages[msgIndex].attachments[attIndex], processedAttachment);
                                chatModified = true;

                                if (processedAttachment.downloadStatus === 'completed') {
                                    console.log(`       ✅ Successfully downloaded: ${processedAttachment.localPath}`);
                                    totalDownloaded++;
                                } else {
                                    console.log(`       ❌ Download failed: ${processedAttachment.downloadError}`);
                                    totalFailed++;
                                }
                            } else {
                                console.log(`       ❌ Could not find attachment in full message data`);
                                totalFailed++;
                            }

                        } catch (error) {
                            console.error(`       ❌ Error downloading attachment:`, error.message);
                            
                            // Update attachment with error status
                            chat.messages[msgIndex].attachments[attIndex].downloadStatus = 'failed';
                            chat.messages[msgIndex].attachments[attIndex].downloadError = error.message;
                            chatModified = true;
                            totalFailed++;
                        }
                    }
                }
            }

            // Save the chat if we modified it
            if (chatModified) {
                await chat.save();
                console.log(`  💾 Updated chat with downloaded media`);
            }
        }

        console.log(`\n🎉 Media download completed!`);
        console.log(`   ✅ Successfully downloaded: ${totalDownloaded}`);
        console.log(`   ❌ Failed downloads: ${totalFailed}`);

        await mongoose.connection.close();

    } catch (error) {
        console.error('Error downloading media files:', error);
        process.exit(1);
    }
}

// Run the script
downloadRealMediaFiles();
