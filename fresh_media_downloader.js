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
        
        // Use domain-wide delegation (Method 2 from diagnostics)
        auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
            subject: 'naveendev@crossmilescarrier.com'
        });

        chatApi = google.chat({ version: 'v1', auth });
        console.log('✓ Google Chat API initialized with working authentication');
        
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
    if (contentName && contentName.includes('.')) {
        const ext = path.extname(contentName);
        if (ext) return ext;
    }

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
            console.log(`   HTTP Status: ${response.statusCode}`);
            
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                let downloadedBytes = 0;
                
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });
                
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(downloadedBytes);
                });
                
                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => {}); 
                    reject(err);
                });
                
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                const redirectUrl = response.headers.location;
                console.log(`   Following redirect...`);
                downloadFileFromUrl(redirectUrl, filePath, authToken).then(resolve).catch(reject);
            } else {
                let errorBody = '';
                response.on('data', chunk => errorBody += chunk);
                response.on('end', () => {
                    reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 100)}`));
                });
            }
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.abort();
            reject(new Error('Download timeout'));
        });
        
        request.end();
    });
}

async function getFreshAttachmentUrls(spaceName, messageName) {
    try {
        console.log(`   🔄 Fetching fresh URLs for message: ${messageName}`);
        
        // Get the message with fresh attachment URLs
        const messageResponse = await chatApi.spaces.messages.get({
            name: messageName
        });
        
        const message = messageResponse.data;
        const attachments = [];
        
        // Check both attachment and attachments fields
        if (message.attachment) {
            // Handle case where attachment is an object with numeric keys (array-like)
            if (typeof message.attachment === 'object' && message.attachment !== null) {
                const keys = Object.keys(message.attachment);
                if (keys.length > 0 && !isNaN(keys[0])) {
                    // It's array-like: {"0": {...}, "1": {...}}
                    keys.forEach(key => {
                        if (message.attachment[key]) {
                            attachments.push(message.attachment[key]);
                        }
                    });
                } else {
                    // It's a direct object
                    attachments.push(message.attachment);
                }
            }
        }
        if (message.attachments && Array.isArray(message.attachments)) {
            attachments.push(...message.attachments);
        }
        
        console.log(`   ✓ Found ${attachments.length} fresh attachments`);
        return attachments;
        
    } catch (error) {
        console.log(`   ❌ Failed to get fresh URLs: ${error.message}`);
        return [];
    }
}

async function downloadFreshAttachment(dbAttachment, spaceName, messageName, authClient) {
    try {
        console.log(`\n📥 Processing: ${dbAttachment.contentName || dbAttachment.name}`);
        console.log(`   Type: ${dbAttachment.contentType}`);
        
        // Get fresh attachment URLs from Google Chat API
        const freshAttachments = await getFreshAttachmentUrls(spaceName, messageName);
        
        if (freshAttachments.length === 0) {
            console.log('   ❌ No fresh attachments found');
            return false;
        }
        
        // Find matching attachment by name or content type
        let freshAttachment = freshAttachments.find(att => 
            att.name === dbAttachment.name || 
            att.contentName === dbAttachment.contentName ||
            (att.contentType === dbAttachment.contentType && freshAttachments.length === 1)
        );
        
        if (!freshAttachment) {
            console.log('   ❌ Could not match attachment with fresh data');
            console.log(`   Available: ${freshAttachments.map(a => a.contentName || a.name).join(', ')}`);
            // Try using the first attachment if only one exists
            if (freshAttachments.length === 1) {
                freshAttachment = freshAttachments[0];
                console.log('   🔄 Using the only available attachment');
            } else {
                return false;
            }
        }
        
        // Get access token
        const accessToken = await authClient.getAccessToken();
        if (!accessToken?.token) {
            console.log('   ❌ Failed to get access token');
            return false;
        }

        // Generate filename
        const extension = getFileExtension(freshAttachment.contentType, freshAttachment.contentName);
        const timestamp = Date.now();
        const safeName = (freshAttachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `fresh_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        let downloadSuccess = false;
        let fileSize = 0;

        // Try downloading with fresh downloadUri (note: Google uses 'Uri' not 'Url')
        const downloadUrl = freshAttachment.downloadUri || freshAttachment.downloadUrl;
        if (downloadUrl) {
            try {
                console.log('   🔗 Trying fresh download URL...');
                fileSize = await downloadFileFromUrl(downloadUrl, filePath, accessToken.token);
                downloadSuccess = true;
            } catch (urlError) {
                console.log(`   ❌ Fresh URL failed: ${urlError.message}`);
            }
        }

        // Try thumbnail URL for images (note: Google uses 'Uri' not 'Url')
        const thumbnailUrl = freshAttachment.thumbnailUri || freshAttachment.thumbnailUrl;
        if (!downloadSuccess && thumbnailUrl && freshAttachment.contentType?.startsWith('image/')) {
            try {
                console.log('   🖼️  Trying fresh thumbnail URL...');
                fileSize = await downloadFileFromUrl(thumbnailUrl, filePath, accessToken.token);
                downloadSuccess = true;
                console.log('   ⚠️  Downloaded thumbnail (reduced quality)');
            } catch (thumbError) {
                console.log(`   ❌ Fresh thumbnail failed: ${thumbError.message}`);
            }
        }

        if (downloadSuccess && fileSize > 0) {
            // Verify file is not HTML error page
            const buffer = fs.readFileSync(filePath);
            const fileStart = buffer.toString('utf8', 0, Math.min(100, buffer.length));
            
            if (fileStart.includes('<html') || fileStart.includes('<!DOCTYPE')) {
                console.log(`   ❌ Downloaded HTML error page, deleting...`);
                fs.unlinkSync(filePath);
                return false;
            }

            console.log(`   ✅ Successfully downloaded: ${filename} (${fileSize} bytes)`);
            return {
                filename: filename,
                filePath: filePath,
                size: fileSize
            };
        }

        return false;

    } catch (error) {
        console.log(`   💥 Download error: ${error.message}`);
        return false;
    }
}

async function downloadAllFreshMedia() {
    try {
        console.log('🚀 Starting fresh media download with new Google Chat URLs...');
        
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

        for (const chat of chatsWithMedia) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName || 'Unknown'}"`);
            console.log(`   Space: ${chat.space?.name || 'No space info'}`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    
                    // Extract space and message names from the message data
                    const messageName = message.messageId || message.name;
                    const spaceName = chat.space?.name;
                    
                    if (!messageName) {
                        console.log('   ⚠️  Skipping message without ID');
                        continue;
                    }
                    
                    console.log(`\n   📨 Processing message: ${messageName}`);
                    
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        // Skip already downloaded real media (not samples)
                        if (attachment.localPath && 
                            attachment.localPath.startsWith('fresh_') && 
                            attachment.downloadStatus === 'completed') {
                            console.log(`   ⏭️  Skipping already downloaded: ${attachment.contentName}`);
                            continue;
                        }
                        
                        const result = await downloadFreshAttachment(
                            attachment, 
                            spaceName, 
                            messageName, 
                            authClient
                        );
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Update attachment in database
                            attachment.downloadStatus = 'completed';
                            attachment.localPath = result.filename;
                            attachment.fileSize = result.size;
                            attachment.downloadedAt = new Date();
                            attachment.isFreshMedia = true;
                            
                            console.log(`   💾 Database updated`);
                        } else {
                            failedDownloads++;
                            attachment.downloadStatus = 'failed';
                            attachment.lastFailedAttempt = new Date();
                        }
                        
                        // Respectful delay
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            
            // Save updated chat
            await chat.save();
            console.log(`💾 Saved chat "${chat.displayName}"`);
        }

        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   ✅ Successful downloads: ${successfulDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${totalAttachments > 0 ? ((successfulDownloads / totalAttachments) * 100).toFixed(1) : 0}%`);

        if (successfulDownloads > 0) {
            console.log(`\n🎉 Downloaded ${successfulDownloads} fresh media files!`);
            console.log(`📁 Files in: ${path.join(__dirname, 'media')}`);
        }

    } catch (error) {
        console.error('💥 Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Done');
    }
}

downloadAllFreshMedia().catch(console.error);
