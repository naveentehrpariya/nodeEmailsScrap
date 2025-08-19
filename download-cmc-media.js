const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const mediaProcessingService = require('./services/mediaProcessingService');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function downloadCMCMedia() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
        // Initialize media processing service
        await mediaProcessingService.initialize();
        
        // Find CMC space
        const cmcChat = await Chat.findOne({ displayName: /CMC/i });
        
        if (!cmcChat) {
            console.log('CMC space not found');
            return;
        }
        
        console.log(`Found CMC space with ${cmcChat.messageCount} messages`);
        
        // Setup Google Chat API auth
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/admin.directory.user.readonly",
            "https://www.googleapis.com/auth/drive.readonly"
        ];
        
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            'naveendev@crossmilescarrier.com' // Use the working account
        );
        
        // Find messages with attachments
        const messagesWithAttachments = cmcChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        console.log(`Found ${messagesWithAttachments.length} messages with attachments`);
        
        let downloadedCount = 0;
        
        for (const message of messagesWithAttachments) {
            console.log(`\nProcessing message: ${message.text || '(no text)'}`);
            console.log(`Attachments: ${message.attachments.length}`);
            
            for (const attachment of message.attachments) {
                console.log(`\nDownloading: ${attachment.contentName || attachment.name}`);
                console.log(`Type: ${attachment.contentType}`);
                console.log(`Name field: ${attachment.name}`);
                
                try {
                    // Use the proper processAttachment method that downloads files
                    const processed = await mediaProcessingService.processAttachment(attachment, message, auth);
                    
                    // Update the attachment in the database with download info
                    const attachmentIndex = message.attachments.findIndex(a => a.name === attachment.name);
                    if (attachmentIndex !== -1) {
                        message.attachments[attachmentIndex] = {
                            ...message.attachments[attachmentIndex],
                            localPath: processed.localPath,
                            downloadStatus: processed.downloadStatus,
                            downloadedAt: processed.downloadedAt,
                            fileSize: processed.fileSize,
                            thumbnailUrl: processed.thumbnailUrl,
                            dimensions: processed.dimensions,
                            duration: processed.duration
                        };
                    }
                    
                    if (processed.downloadStatus === 'completed') {
                        console.log(`✅ Downloaded successfully: ${processed.localPath}`);
                        downloadedCount++;
                    } else {
                        console.log(`❌ Download failed: ${processed.downloadError || 'Unknown error'}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error downloading ${attachment.contentName}:`, error.message);
                }
            }
        }
        
        // Save the updated chat with download info
        await cmcChat.save();
        console.log(`\n🎉 Downloaded ${downloadedCount} media files successfully!`);
        
        // List media directory contents
        const fs = require('fs').promises;
        const mediaFiles = await fs.readdir('./media');
        console.log(`\nMedia directory now contains ${mediaFiles.length} files:`);
        mediaFiles.forEach(file => console.log(`  - ${file}`));
        
    } catch (error) {
        console.error('Download failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the download
downloadCMCMedia();
