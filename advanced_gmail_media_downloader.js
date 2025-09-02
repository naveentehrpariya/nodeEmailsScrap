const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Connect to MongoDB with proper settings
mongoose.set('strictQuery', true);
mongoose.connect(process.env.DB_URL_OFFICE || 'mongodb://localhost:27017/emailscrapper');

const Chat = require('./db/Chat');

async function initializeChatAPI() {
    try {
        console.log('🔧 Initializing Google Chat API with domain-wide delegation...');
        
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error('dispatch.json service account file not found');
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Use domain-wide delegation (Method 2 from diagnosis - this worked!)
        const auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
            subject: 'naveendev@crossmilescarrier.com'
        });

        const chatApi = google.chat({ version: 'v1', auth });
        console.log('✓ Google Chat API initialized with domain-wide delegation');
        
        return { chatApi, auth };
        
    } catch (error) {
        console.error('❌ Failed to initialize Google Chat API:', error.message);
        throw error;
    }
}

function getFileExtension(contentType, contentName) {
    // Try to get extension from content name first
    if (contentName && contentName.includes('.')) {
        const ext = path.extname(contentName);
        if (ext) return ext;
    }

    // Fallback to content type mapping
    const typeMap = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg', 
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'video/avi': '.avi',
        'application/pdf': '.pdf',
        'text/plain': '.txt'
    };
    
    return typeMap[contentType] || '.bin';
}

async function downloadAttachmentViaAPI(attachment, chatApi) {
    try {
        console.log(`\n📥 Downloading: ${attachment.contentName || attachment.filename}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Resource name: ${attachment.name}`);
        
        // Generate proper filename
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const cleanName = (attachment.contentName || attachment.filename || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${cleanName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        const filePath = path.join(mediaDir, filename);
        
        // Ensure media directory exists
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        
        // Skip if file already exists and is not empty
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 100) {
                console.log(`⏭️  File already exists: ${filename} (${stats.size} bytes)`);
                return { success: true, filename, size: stats.size, skipped: true };
            }
        }
        
        // Method 1: Try Google Chat API media.download
        try {
            console.log('   🔧 Trying Chat API media.download...');
            const response = await chatApi.media.download({
                resourceName: attachment.name
            });
            
            if (response.data) {
                console.log('   ✓ Got data from Chat API media.download');
                
                // Write data to file
                let buffer;
                if (typeof response.data === 'string') {
                    buffer = Buffer.from(response.data, 'base64');
                } else if (Buffer.isBuffer(response.data)) {
                    buffer = response.data;
                } else {
                    buffer = Buffer.from(JSON.stringify(response.data));
                }
                
                fs.writeFileSync(filePath, buffer);
                const fileSize = fs.statSync(filePath).size;
                
                console.log(`✅ Downloaded via Chat API: ${filename} (${fileSize} bytes)`);
                return { success: true, filename, size: fileSize, method: 'chat-api' };
            }
        } catch (apiError) {
            console.log(`   ❌ Chat API media.download failed: ${apiError.message}`);
        }
        
        // Method 2: Try to fetch the original message and extract attachment data
        try {
            console.log('   🔍 Trying to fetch original message...');
            
            // Parse the attachment name to get message details
            const nameParts = attachment.name.split('/');
            if (nameParts.length >= 4) {
                const spaceId = nameParts[1];
                const messageId = nameParts[3];
                
                console.log(`   Space: ${spaceId}, Message: ${messageId}`);
                
                const messageResponse = await chatApi.spaces.messages.get({
                    name: `spaces/${spaceId}/messages/${messageId}`
                });
                
                if (messageResponse.data && messageResponse.data.attachment) {
                    console.log('   ✓ Got message with attachments');
                    console.log(`   Found ${messageResponse.data.attachment.length} attachments in message`);
                    
                    // Find matching attachment
                    const matchingAttachment = messageResponse.data.attachment.find(att => 
                        att.name === attachment.name || 
                        att.contentName === attachment.contentName
                    );
                    
                    if (matchingAttachment) {
                        console.log('   ✓ Found matching attachment in message');
                        
                        // Try downloading this attachment
                        if (matchingAttachment.attachmentDataRef && matchingAttachment.attachmentDataRef.resourceName) {
                            try {
                                console.log('   📡 Trying to download via attachmentDataRef...');
                                
                                // Decode the base64 resourceName
                                const resourceData = Buffer.from(matchingAttachment.attachmentDataRef.resourceName, 'base64').toString();
                                console.log(`   Decoded resource: ${resourceData.substring(0, 100)}...`);
                                
                                // Try the media download with the decoded resource name
                                const downloadResponse = await chatApi.media.download({
                                    resourceName: resourceData
                                });
                                
                                if (downloadResponse.data) {
                                    console.log('   ✓ Successfully downloaded via decoded resource name');
                                    
                                    let buffer;
                                    if (typeof downloadResponse.data === 'string') {
                                        buffer = Buffer.from(downloadResponse.data, 'base64');
                                    } else {
                                        buffer = Buffer.from(downloadResponse.data);
                                    }
                                    
                                    fs.writeFileSync(filePath, buffer);
                                    const fileSize = fs.statSync(filePath).size;
                                    
                                    console.log(`✅ Downloaded via decoded resource: ${filename} (${fileSize} bytes)`);
                                    return { success: true, filename, size: fileSize, method: 'decoded-resource' };
                                }
                            } catch (resourceError) {
                                console.log(`   ❌ Decoded resource download failed: ${resourceError.message}`);
                            }
                        }
                    }
                }
            }
        } catch (messageError) {
            console.log(`   ❌ Message fetch failed: ${messageError.message}`);
        }
        
        // Method 3: Try direct HTTP download of attachment URLs (last resort)
        try {
            console.log('   🌐 Trying direct HTTP download (last resort)...');
            
            if (attachment.downloadUrl) {
                const https = require('https');
                const { URL } = require('url');
                
                // Get access token
                const accessToken = await chatApi._options.auth.getAccessToken();
                
                return new Promise((resolve) => {
                    const url = new URL(attachment.downloadUrl);
                    
                    const options = {
                        hostname: url.hostname,
                        path: url.pathname + url.search,
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken.token}`,
                            'User-Agent': 'Gmail-Chat-Downloader/1.0'
                        }
                    };
                    
                    const request = https.request(options, (response) => {
                        console.log(`   HTTP Response: ${response.statusCode}`);
                        
                        if (response.statusCode === 200) {
                            const fileStream = fs.createWriteStream(filePath);
                            let downloadedBytes = 0;
                            
                            response.on('data', (chunk) => {
                                downloadedBytes += chunk.length;
                            });
                            
                            response.pipe(fileStream);
                            
                            fileStream.on('finish', () => {
                                fileStream.close();
                                console.log(`✅ Downloaded via HTTP: ${filename} (${downloadedBytes} bytes)`);
                                resolve({ success: true, filename, size: downloadedBytes, method: 'http-auth' });
                            });
                        } else {
                            console.log(`   ❌ HTTP download failed: ${response.statusCode}`);
                            resolve({ success: false, error: `HTTP ${response.statusCode}` });
                        }
                    });
                    
                    request.on('error', (error) => {
                        console.log(`   ❌ HTTP request failed: ${error.message}`);
                        resolve({ success: false, error: error.message });
                    });
                    
                    request.setTimeout(30000, () => {
                        request.destroy();
                        resolve({ success: false, error: 'Timeout' });
                    });
                    
                    request.end();
                });
            }
        } catch (httpError) {
            console.log(`   ❌ HTTP download failed: ${httpError.message}`);
        }
        
        console.log('❌ All download methods failed');
        return { success: false, error: 'All methods failed' };
        
    } catch (error) {
        console.error(`❌ Download error for ${attachment.contentName}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function downloadAllGmailAttachments() {
    try {
        console.log('🚀 Starting advanced Gmail attachment download...');
        
        const { chatApi } = await initializeChatAPI();
        
        // Find all chats with attachments (using the working query from debug)
        const chats = await Chat.find({
            messages: { 
                $elemMatch: { 
                    attachments: { 
                        $exists: true, 
                        $not: { $size: 0 } 
                    } 
                } 
            }
        });
        
        console.log(`📊 Found ${chats.length} chats with attachments`);
        
        let totalAttachments = 0;
        let successfulDownloads = 0;
        let skippedDownloads = 0;
        let failedDownloads = 0;
        
        for (const chat of chats) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        totalAttachments++;
                        
                        console.log(`\n--- Attachment ${totalAttachments}/${totalAttachments} ---`);
                        
                        const result = await downloadAttachmentViaAPI(attachment, chatApi);
                        
                        if (result.success) {
                            if (result.skipped) {
                                skippedDownloads++;
                            } else {
                                successfulDownloads++;
                            }
                        } else {
                            failedDownloads++;
                        }
                        
                        // Small delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        }
        
        console.log(`\n🎯 DOWNLOAD RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   ✅ Successful downloads: ${successfulDownloads}`);
        console.log(`   ⏭️  Skipped (already exist): ${skippedDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${(((successfulDownloads + skippedDownloads) / totalAttachments) * 100).toFixed(1)}%`);
        
        // List all files in media directory
        const mediaDir = path.join(__dirname, 'media');
        const files = fs.readdirSync(mediaDir)
            .filter(f => !f.startsWith('.') && !f.startsWith('sample') && !f.includes('html'))
            .sort();
        
        console.log(`\n📁 Files in media directory (${files.length}):`);
        files.forEach(file => {
            const filePath = path.join(mediaDir, file);
            const stats = fs.statSync(filePath);
            const sizeStr = stats.size > 1024 * 1024 
                ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.round(stats.size / 1024)} KB`;
            console.log(`   ${file} (${sizeStr})`);
        });
        
    } catch (error) {
        console.error('❌ Error downloading attachments:', error);
    } finally {
        mongoose.disconnect();
        console.log('\n👋 Disconnected from database');
    }
}

// Run the download
downloadAllGmailAttachments();
