const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

// Initialize Google Chat API
let chatApi;
let auth;

async function initializeGoogleAPIs() {
    try {
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error('dispatch.json service account file not found');
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Create auth for the specific user (impersonation)
        auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
            subject: 'naveendev@crossmilescarrier.com' // User to impersonate
        });

        chatApi = google.chat({ version: 'v1', auth });
        console.log('✓ Google Chat API initialized with domain-wide delegation');
        
        return auth;
    } catch (error) {
        console.error('❌ Failed to initialize Google APIs:', error.message);
        throw error;
    }
}

async function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✓ Created directory: ${dirPath}`);
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
        'text/plain': '.txt',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
    };
    
    return typeMap[contentType] || '.bin';
}

async function downloadFileFromUrl(url, filePath, authToken) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'User-Agent': 'Google-Apps-Script',
                'Accept': '*/*'
            }
        };

        const request = https.request(options, (response) => {
            console.log(`   Response status: ${response.statusCode}`);
            
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                let downloadedBytes = 0;
                
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });
                
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`   Downloaded ${downloadedBytes} bytes`);
                    resolve(downloadedBytes);
                });
                
                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => {}); // Delete incomplete file
                    reject(err);
                });
                
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                const redirectUrl = response.headers.location;
                console.log(`   Following redirect to: ${redirectUrl}`);
                downloadFileFromUrl(redirectUrl, filePath, authToken).then(resolve).catch(reject);
            } else {
                let errorBody = '';
                response.on('data', chunk => errorBody += chunk);
                response.on('end', () => {
                    reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 200)}`));
                });
            }
        });

        request.on('error', reject);
        request.setTimeout(60000, () => {
            request.abort();
            reject(new Error('Download timeout'));
        });
        
        request.end();
    });
}

async function downloadRealAttachment(attachment, authClient) {
    try {
        console.log(`\n📥 Downloading real attachment: ${attachment.contentName || attachment.name}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Size: ${attachment.driveDataRef?.driveFileId ? 'Drive file' : 'Chat attachment'}`);

        // Get access token
        const accessToken = await authClient.getAccessToken();
        if (!accessToken?.token) {
            console.log('❌ Failed to get access token');
            return false;
        }

        // Generate filename with proper extension
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `real_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        let downloadSuccess = false;
        let fileSize = 0;

        // Method 1: Try Chat API media download if we have a resource name
        if (attachment.name && attachment.name.includes('spaces/')) {
            try {
                console.log('   Trying Google Chat API media download...');
                const response = await chatApi.media.download({
                    resourceName: attachment.name
                });
                
                if (response.data) {
                    console.log('   ✓ Got data from Chat API');
                    fs.writeFileSync(filePath, response.data);
                    fileSize = fs.statSync(filePath).size;
                    downloadSuccess = true;
                }
            } catch (apiError) {
                console.log(`   ❌ Chat API failed: ${apiError.message}`);
            }
        }

        // Method 2: Try direct URL download
        if (!downloadSuccess && attachment.downloadUrl) {
            try {
                console.log('   Trying direct URL download...');
                fileSize = await downloadFileFromUrl(attachment.downloadUrl, filePath, accessToken.token);
                downloadSuccess = true;
            } catch (urlError) {
                console.log(`   ❌ Direct URL failed: ${urlError.message}`);
            }
        }

        // Method 3: Try thumbnail URL if main download failed (for images)
        if (!downloadSuccess && attachment.thumbnailUrl && attachment.contentType?.startsWith('image/')) {
            try {
                console.log('   Trying thumbnail URL as fallback...');
                fileSize = await downloadFileFromUrl(attachment.thumbnailUrl, filePath, accessToken.token);
                downloadSuccess = true;
                console.log('   ⚠️  Downloaded thumbnail version (not full resolution)');
            } catch (thumbError) {
                console.log(`   ❌ Thumbnail URL failed: ${thumbError.message}`);
            }
        }

        if (downloadSuccess && fileSize > 0) {
            console.log(`✅ Successfully downloaded: ${filename}`);
            console.log(`   File size: ${fileSize} bytes`);
            
            // Verify the file is not an HTML error page
            const fileContent = fs.readFileSync(filePath, 'utf8', { flag: 'r' }).substring(0, 100);
            if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE')) {
                console.log(`❌ Downloaded file appears to be HTML error page, deleting...`);
                fs.unlinkSync(filePath);
                return false;
            }

            return {
                filename: filename,
                filePath: filePath,
                size: fileSize
            };
        } else {
            console.log(`❌ All download methods failed for: ${attachment.contentName}`);
            return false;
        }

    } catch (error) {
        console.log(`❌ Download error: ${error.message}`);
        return false;
    }
}

async function downloadAllRealMedia() {
    try {
        console.log('🚀 Starting real media download from Google Chat...');
        
        // Initialize APIs
        const authClient = await initializeGoogleAPIs();
        
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Find chats with attachments
        const allChats = await Chat.find({});
        const chatsWithMedia = allChats.filter(chat => 
            chat.messages && chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`\n📊 Found ${chatsWithMedia.length} chats with attachments`);

        let totalAttachments = 0;
        let successfulDownloads = 0;
        let failedDownloads = 0;
        let skippedAttachments = 0;

        for (const chat of chatsWithMedia) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName || 'Unknown'}"`);
            
            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        // Skip if already successfully downloaded (not sample files)
                        if (attachment.localPath && 
                            !attachment.localPath.startsWith('sample_') && 
                            !attachment.localPath.startsWith('sample.') &&
                            attachment.downloadStatus === 'completed') {
                            console.log(`⏭️  Skipping already downloaded: ${attachment.contentName}`);
                            skippedAttachments++;
                            continue;
                        }
                        
                        console.log(`\n--- Processing attachment ${totalAttachments - skippedAttachments}/${totalAttachments - skippedAttachments} ---`);
                        
                        const result = await downloadRealAttachment(attachment, authClient);
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Update attachment in database with real local path
                            message.attachments[attachmentIndex].downloadStatus = 'completed';
                            message.attachments[attachmentIndex].localPath = result.filename;
                            message.attachments[attachmentIndex].fileSize = result.size;
                            message.attachments[attachmentIndex].downloadedAt = new Date();
                            message.attachments[attachmentIndex].isRealMedia = true;
                            
                            console.log(`💾 Updated database record`);
                        } else {
                            failedDownloads++;
                            message.attachments[attachmentIndex].downloadStatus = 'failed';
                            message.attachments[attachmentIndex].lastFailedAttempt = new Date();
                        }
                        
                        // Delay between downloads to be respectful
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }
            
            // Save updated chat to database
            await chat.save();
            console.log(`💾 Saved chat "${chat.displayName}" to database`);
        }

        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`   📊 Total attachments found: ${totalAttachments}`);
        console.log(`   ⏭️  Already downloaded (skipped): ${skippedAttachments}`);
        console.log(`   ✅ New successful downloads: ${successfulDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${totalAttachments > skippedAttachments ? ((successfulDownloads / (totalAttachments - skippedAttachments)) * 100).toFixed(1) : 0}%`);

        if (successfulDownloads > 0) {
            console.log(`\n🎉 Successfully downloaded ${successfulDownloads} real media files!`);
            console.log(`📁 Files saved to: ${path.join(__dirname, 'media')}`);
            console.log(`🔄 Refresh your frontend to see the real media content!`);
        } else if (skippedAttachments > 0) {
            console.log(`\n✨ All ${skippedAttachments} media files were already downloaded!`);
        } else {
            console.log(`\n😕 No media files were successfully downloaded. Check the errors above.`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from database');
    }
}

// Run the downloader
downloadAllRealMedia().catch(console.error);
