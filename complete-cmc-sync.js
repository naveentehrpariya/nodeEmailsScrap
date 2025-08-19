const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function completeCMCSync() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
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
            'naveendev@crossmilescarrier.com'
        );
        
        const chat = google.chat({ version: "v1", auth });
        
        // Find or create CMC chat in database
        let cmcChat = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
        if (!cmcChat) {
            cmcChat = new Chat({
                spaceId: 'spaces/AAQAPUbCMD0',
                displayName: 'CMC',
                spaceType: 'SPACE',
                messages: [],
                messageCount: 0
            });
        }
        
        console.log('Fetching fresh message data from CMC space...');
        
        // Get fresh data from API
        const messageRes = await chat.spaces.messages.list({
            parent: 'spaces/AAQAPUbCMD0', // CMC space ID
            pageSize: 100,
        });
        
        const messages = messageRes.data.messages || [];
        let downloadCount = 0;
        let processedMessages = [];
        
        for (const message of messages) {
            // Get full message details
            const fullMessage = await chat.spaces.messages.get({
                name: message.name
            });
            
            const fullData = fullMessage.data;
            const attachments = fullData.attachments || fullData.attachment || [];
            
            const attachmentList = Array.isArray(attachments) ? attachments : [attachments];
            let processedAttachments = [];
            
            console.log(`\nProcessing message: ${message.name}`);
            console.log(`Text: ${(fullData.text || '(no text)').substring(0, 50)}...`);
            console.log(`Attachments: ${attachmentList.length}`);
            
            // Process attachments
            for (const attachment of attachmentList) {
                if (!attachment.contentName) continue;
                
                try {
                    console.log(`\nProcessing: ${attachment.contentName}`);
                    console.log(`Type: ${attachment.contentType}`);
                    console.log(`Download URL present: ${!!attachment.downloadUri}`);
                    
                    let processedAttachment = {
                        name: attachment.name,
                        contentName: attachment.contentName,
                        contentType: attachment.contentType,
                        fileName: attachment.contentName,
                        filename: attachment.contentName,
                        mimeType: attachment.contentType,
                        source: attachment.source,
                        attachmentDataRef: attachment.attachmentDataRef,
                        downloadUri: attachment.downloadUri,
                        thumbnailUri: attachment.thumbnailUri,
                        downloadStatus: 'pending',
                        mediaType: 'other'
                    };
                    
                    // Classify media type
                    if (attachment.contentType?.includes('image')) processedAttachment.mediaType = 'image';
                    else if (attachment.contentType?.includes('video')) processedAttachment.mediaType = 'video';
                    else if (attachment.contentType?.includes('pdf')) processedAttachment.mediaType = 'document';
                    else if (attachment.contentType?.includes('audio')) processedAttachment.mediaType = 'audio';
                    
                    // Set boolean flags
                    processedAttachment.isImage = processedAttachment.mediaType === 'image';
                    processedAttachment.isVideo = processedAttachment.mediaType === 'video';
                    processedAttachment.isDocument = processedAttachment.mediaType === 'document';
                    processedAttachment.isAudio = processedAttachment.mediaType === 'audio';
                    
                    // Download the file if URL is available
                    if (attachment.downloadUri) {
                        try {
                            // Sanitize filename
                            const sanitizedName = attachment.contentName
                                .replace(/[<>:"/\\|?*]/g, '_')
                                .replace(/\s+/g, '_');
                            const timestamp = Date.now();
                            const fileName = `${timestamp}_${sanitizedName}`;
                            const localPath = path.join('./media', fileName);
                            
                            console.log(`Downloading as: ${fileName}`);
                            
                            // Download the file using axios with the direct URL
                            const response = await axios({
                                method: 'GET',
                                url: attachment.downloadUri,
                                responseType: 'stream',
                                timeout: 30000 // 30 second timeout
                            });
                            
                            // Stream the file to disk
                            const writeStream = require('fs').createWriteStream(localPath);
                            response.data.pipe(writeStream);
                            
                            await new Promise((resolve, reject) => {
                                writeStream.on('finish', resolve);
                                writeStream.on('error', reject);
                            });
                            
                            // Get file stats and update attachment
                            const stats = await fs.stat(localPath);
                            processedAttachment.localPath = `/media/${fileName}`;
                            processedAttachment.downloadStatus = 'completed';
                            processedAttachment.downloadedAt = new Date();
                            processedAttachment.fileSize = stats.size;
                            processedAttachment.size = stats.size;
                            
                            console.log(`✅ Downloaded: ${fileName} (${stats.size} bytes)`);
                            downloadCount++;
                            
                        } catch (downloadError) {
                            console.error(`❌ Download failed: ${downloadError.message}`);
                            processedAttachment.downloadStatus = 'failed';
                            processedAttachment.downloadError = downloadError.message;
                        }
                    } else {
                        processedAttachment.downloadStatus = 'no_url';
                    }
                    
                    processedAttachments.push(processedAttachment);
                    
                } catch (error) {
                    console.error(`❌ Error processing ${attachment.contentName}:`, error.message);
                }
            }
            
            // Create processed message
            const processedMessage = {
                messageId: fullData.name,
                text: fullData.text || '',
                sender: fullData.sender?.displayName || 'Unknown',
                senderEmail: fullData.sender?.email || 'unknown@unknown.com',
                timestamp: new Date(fullData.createTime || Date.now()),
                attachments: processedAttachments,
                createdAt: new Date()
            };
            
            processedMessages.push(processedMessage);
        }
        
        // Update the chat in database
        cmcChat.messages = processedMessages;
        cmcChat.messageCount = processedMessages.length;
        cmcChat.updatedAt = new Date();
        
        await cmcChat.save();
        
        console.log(`\n🎉 Successfully processed ${processedMessages.length} messages and downloaded ${downloadCount} media files!`);
        
        // List media directory contents
        const mediaFiles = await fs.readdir('./media');
        console.log(`\nMedia directory now contains ${mediaFiles.length} files:`);
        mediaFiles.forEach(file => {
            if (file !== 'thumbnails') {
                console.log(`  - ${file}`);
            }
        });
        
        // Verification
        console.log('\n=== VERIFICATION ===');
        const updatedChat = await Chat.findOne({ spaceId: 'spaces/AAQAPUbCMD0' });
        const messagesWithAttachments = updatedChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        console.log(`Found ${messagesWithAttachments.length} messages with attachments:`);
        messagesWithAttachments.forEach((msg, i) => {
            console.log(`\nMessage ${i + 1}: "${(msg.text || '(no text)').substring(0, 30)}..."`);
            msg.attachments.forEach((att, j) => {
                console.log(`  Attachment ${j + 1}: ${att.contentName}`);
                console.log(`    Local Path: ${att.localPath || 'not available'}`);
                console.log(`    Status: ${att.downloadStatus}`);
                console.log(`    Media Type: ${att.mediaType}`);
                console.log(`    File Size: ${att.fileSize || 0} bytes`);
            });
        });
        
    } catch (error) {
        console.error('Complete sync failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the complete sync
completeCMCSync();
