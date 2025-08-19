const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const mediaProcessingService = require('./services/mediaProcessingService');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function downloadCMCDirect() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
        // Initialize media processing service
        await mediaProcessingService.initialize();
        
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
        
        // Get fresh data from API
        console.log('Fetching fresh message data from CMC space...');
        const messageRes = await chat.spaces.messages.list({
            parent: 'spaces/AAQAPUbCMD0', // CMC space ID
            pageSize: 100,
        });
        
        const messages = messageRes.data.messages || [];
        let downloadCount = 0;
        
        for (const message of messages) {
            // Get full message details
            const fullMessage = await chat.spaces.messages.get({
                name: message.name
            });
            
            const fullData = fullMessage.data;
            const attachments = fullData.attachments || fullData.attachment || [];
            
            if (!attachments || attachments.length === 0) {
                continue;
            }
            
            const attachmentList = Array.isArray(attachments) ? attachments : [attachments];
            
            console.log(`\nProcessing message: ${message.name}`);
            console.log(`Text: ${(fullData.text || '(no text)').substring(0, 50)}...`);
            console.log(`Attachments: ${attachmentList.length}`);
            
            for (const attachment of attachmentList) {
                try {
                    console.log(`\nDownloading: ${attachment.contentName}`);
                    console.log(`Type: ${attachment.contentType}`);
                    console.log(`Download URL present: ${!!attachment.downloadUri}`);
                    
                    if (!attachment.downloadUri) {
                        console.log('❌ No download URL available');
                        continue;
                    }
                    
                    // Sanitize filename
                    const sanitizedName = attachment.contentName
                        .replace(/[<>:"/\\|?*]/g, '_')
                        .replace(/\s+/g, '_');
                    const timestamp = Date.now();
                    const fileName = `${timestamp}_${sanitizedName}`;
                    const localPath = path.join('./media', fileName);
                    
                    console.log(`Saving as: ${fileName}`);
                    
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
                    
                    // Get file stats
                    const stats = await fs.stat(localPath);
                    console.log(`✅ Downloaded: ${fileName} (${stats.size} bytes)`);
                    downloadCount++;
                    
                    // Also download thumbnail if available
                    if (attachment.thumbnailUri) {
                        try {
                            const thumbResponse = await axios({
                                method: 'GET',
                                url: attachment.thumbnailUri,
                                responseType: 'stream',
                                timeout: 10000
                            });
                            
                            const thumbFileName = `thumb_${timestamp}_${sanitizedName.replace(/\.[^.]+$/, '.jpg')}`;
                            const thumbPath = path.join('./media/thumbnails', thumbFileName);
                            
                            const thumbWriteStream = require('fs').createWriteStream(thumbPath);
                            thumbResponse.data.pipe(thumbWriteStream);
                            
                            await new Promise((resolve, reject) => {
                                thumbWriteStream.on('finish', resolve);
                                thumbWriteStream.on('error', reject);
                            });
                            
                            console.log(`📷 Downloaded thumbnail: ${thumbFileName}`);
                        } catch (thumbError) {
                            console.log(`⚠️ Failed to download thumbnail: ${thumbError.message}`);
                        }
                    }
                    
                } catch (error) {
                    console.error(`❌ Error downloading ${attachment.contentName}:`, error.message);
                }
            }
        }
        
        console.log(`\n🎉 Successfully downloaded ${downloadCount} media files!`);
        
        // List media directory contents
        const mediaFiles = await fs.readdir('./media');
        console.log(`\nMedia directory now contains ${mediaFiles.length} files:`);
        mediaFiles.forEach(file => {
            if (file !== 'thumbnails') {
                console.log(`  - ${file}`);
            }
        });
        
    } catch (error) {
        console.error('Download failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the download
downloadCMCDirect();
