const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Connect to MongoDB
mongoose.set('strictQuery', true);
mongoose.connect(process.env.DB_URL_OFFICE || 'mongodb://localhost:27017/emailscrapper');

const Chat = require('./db/Chat');

async function downloadAttachment(attachment, filename) {
    console.log(`🔄 Downloading: ${filename}`);
    console.log(`   Type: ${attachment.contentType}`);
    
    // Try downloadUrl first, then thumbnailUrl as fallback
    const downloadUrl = attachment.downloadUrl || attachment.thumbnailUrl;
    
    if (!downloadUrl) {
        console.log(`❌ No download URL available for ${filename}`);
        return false;
    }
    
    console.log(`   URL: ${downloadUrl.substring(0, 80)}...`);
    
    const mediaDir = path.join(__dirname, 'media');
    const filePath = path.join(mediaDir, filename);
    
    // Ensure media directory exists
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    return new Promise((resolve) => {
        const isHttps = downloadUrl.startsWith('https:');
        const httpModule = isHttps ? https : http;
        
        const request = httpModule.get(downloadUrl, (response) => {
            console.log(`   Response status: ${response.statusCode}`);
            console.log(`   Content-Type: ${response.headers['content-type']}`);
            console.log(`   Content-Length: ${response.headers['content-length']}`);
            
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                let downloadedBytes = 0;
                
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });
                
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✅ Downloaded: ${filename} (${downloadedBytes} bytes)`);
                    resolve(true);
                });
                
                fileStream.on('error', (error) => {
                    console.log(`❌ File write error: ${error.message}`);
                    fs.unlinkSync(filePath).catch(() => {}); // Clean up partial file
                    resolve(false);
                });
                
            } else if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                console.log(`   🔄 Redirecting to: ${response.headers.location.substring(0, 80)}...`);
                
                // Follow redirect
                const redirectUrl = response.headers.location;
                const redirectIsHttps = redirectUrl.startsWith('https:');
                const redirectHttpModule = redirectIsHttps ? https : http;
                
                const redirectRequest = redirectHttpModule.get(redirectUrl, (redirectResponse) => {
                    console.log(`   Redirect status: ${redirectResponse.statusCode}`);
                    
                    if (redirectResponse.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filePath);
                        let downloadedBytes = 0;
                        
                        redirectResponse.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                        });
                        
                        redirectResponse.pipe(fileStream);
                        
                        fileStream.on('finish', () => {
                            fileStream.close();
                            console.log(`✅ Downloaded via redirect: ${filename} (${downloadedBytes} bytes)`);
                            resolve(true);
                        });
                        
                        fileStream.on('error', (error) => {
                            console.log(`❌ Redirect file write error: ${error.message}`);
                            fs.unlinkSync(filePath).catch(() => {});
                            resolve(false);
                        });
                    } else {
                        console.log(`❌ Redirect failed with status: ${redirectResponse.statusCode}`);
                        resolve(false);
                    }
                });
                
                redirectRequest.on('error', (error) => {
                    console.log(`❌ Redirect request error: ${error.message}`);
                    resolve(false);
                });
                
            } else {
                console.log(`❌ HTTP error ${response.statusCode}`);
                resolve(false);
            }
        });
        
        request.on('error', (error) => {
            console.log(`❌ Request error: ${error.message}`);
            resolve(false);
        });
        
        // Set timeout
        request.setTimeout(30000, () => {
            console.log(`❌ Request timeout for ${filename}`);
            request.destroy();
            resolve(false);
        });
    });
}

async function downloadAllGmailAttachments() {
    try {
        console.log('🚀 Starting Gmail attachment download...');
        
        // Find all chats with attachments
        const chats = await Chat.find({
            'messages.attachments': { $exists: true, $ne: [] }
        });
        
        console.log(`📊 Found ${chats.length} chats with attachments`);
        
        let totalAttachments = 0;
        let successfulDownloads = 0;
        let failedDownloads = 0;
        
        for (const chat of chats) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        totalAttachments++;
                        const filename = attachment.filename || attachment.contentName || `attachment_${attachment._id}`;
                        
                        console.log(`\n--- Attachment ${totalAttachments} ---`);
                        
                        // Check if file already exists and is not empty
                        const filePath = path.join(__dirname, 'media', filename);
                        if (fs.existsSync(filePath)) {
                            const stats = fs.statSync(filePath);
                            if (stats.size > 1000) { // Only skip if file is reasonably sized
                                console.log(`⏭️  Skipping ${filename} (already exists, ${stats.size} bytes)`);
                                successfulDownloads++;
                                continue;
                            }
                        }
                        
                        const success = await downloadAttachment(attachment, filename);
                        if (success) {
                            successfulDownloads++;
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
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${((successfulDownloads / totalAttachments) * 100).toFixed(1)}%`);
        
        // List downloaded files
        const mediaDir = path.join(__dirname, 'media');
        const files = fs.readdirSync(mediaDir).filter(f => !f.startsWith('sample'));
        console.log(`\n📁 Downloaded files in media directory:`);
        files.forEach(file => {
            const filePath = path.join(mediaDir, file);
            const stats = fs.statSync(filePath);
            console.log(`   ${file} (${stats.size} bytes)`);
        });
        
    } catch (error) {
        console.error('❌ Error downloading attachments:', error);
    } finally {
        mongoose.disconnect();
        console.log('👋 Disconnected from database');
    }
}

// Run the download
downloadAllGmailAttachments();
