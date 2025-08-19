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
                'https://www.googleapis.com/auth/chat.messages',
                'https://www.googleapis.com/auth/chat.spaces',
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

async function downloadWithAuth(url, filePath, authToken, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity', // Don't use compression for binary files
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    ...options.headers
                }
            };

            console.log(`   Making request to: ${urlObj.hostname}${urlObj.pathname}`);
            
            const request = https.request(requestOptions, (response) => {
                console.log(`   Response status: ${response.statusCode}`);
                console.log(`   Response headers:`, Object.keys(response.headers));
                
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
                    downloadWithAuth(redirectUrl, filePath, authToken, options).then(resolve).catch(reject);
                } else {
                    let errorBody = '';
                    response.on('data', chunk => errorBody += chunk);
                    response.on('end', () => {
                        console.log(`   Error response: ${errorBody.substring(0, 300)}`);
                        reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 200)}`));
                    });
                }
            });

            request.on('error', (err) => {
                console.log(`   Request error: ${err.message}`);
                reject(err);
            });
            
            request.setTimeout(120000, () => {
                request.abort();
                reject(new Error('Download timeout (2 minutes)'));
            });
            
            request.end();
        } catch (err) {
            reject(err);
        }
    });
}

// Function to resolve Google Chat attachment URLs
async function resolveAttachmentUrl(attachment, authClient) {
    try {
        console.log(`   🔍 Resolving attachment URL...`);
        
        // Method 1: If we have a direct downloadUrl that looks like get_attachment_url
        if (attachment.downloadUrl && attachment.downloadUrl.includes('get_attachment_url')) {
            console.log(`   → Using direct get_attachment_url: ${attachment.downloadUrl.substring(0, 100)}...`);
            return attachment.downloadUrl;
        }
        
        // Method 2: If we have thumbnailUrl with get_attachment_url
        if (attachment.thumbnailUrl && attachment.thumbnailUrl.includes('get_attachment_url')) {
            console.log(`   → Using thumbnail get_attachment_url: ${attachment.thumbnailUrl.substring(0, 100)}...`);
            return attachment.thumbnailUrl;
        }
        
        // Method 3: Try to construct get_attachment_url if we have attachment token
        if (attachment.attachmentToken) {
            const attachmentUrl = `https://chat.google.com/api/get_attachment_url?` +
                `url_type=FIFE_URL&` +
                `content_type=${encodeURIComponent(attachment.contentType || 'application/octet-stream')}&` +
                `attachment_token=${encodeURIComponent(attachment.attachmentToken)}&` +
                `sz=w2048`; // Request high resolution
                
            console.log(`   → Constructed get_attachment_url from token`);
            return attachmentUrl;
        }
        
        // Method 4: Try the Chat API resource name approach
        if (attachment.name && attachment.name.includes('spaces/')) {
            console.log(`   → Using Chat API resource name: ${attachment.name}`);
            return null; // Will be handled by Chat API method
        }
        
        console.log(`   ❌ No resolvable URL found for attachment`);
        return null;
        
    } catch (error) {
        console.log(`   ❌ Error resolving attachment URL: ${error.message}`);
        return null;
    }
}

async function downloadGoogleChatAttachment(attachment, authClient) {
    try {
        console.log(`\n📥 Downloading Google Chat attachment: ${attachment.contentName || attachment.name || 'Unknown'}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Has downloadUrl: ${!!attachment.downloadUrl}`);
        console.log(`   Has thumbnailUrl: ${!!attachment.thumbnailUrl}`);
        console.log(`   Has attachmentToken: ${!!attachment.attachmentToken}`);

        // Get access token
        const accessToken = await authClient.getAccessToken();
        if (!accessToken?.token) {
            console.log('❌ Failed to get access token');
            return false;
        }

        // Generate filename with proper extension
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || attachment.name || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `gchat_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        let downloadSuccess = false;
        let fileSize = 0;
        let directMediaUrl = null;

        // Try to resolve the attachment URL
        const resolvedUrl = await resolveAttachmentUrl(attachment, authClient);
        
        if (resolvedUrl) {
            try {
                console.log('   🌐 Attempting download from resolved URL...');
                fileSize = await downloadWithAuth(resolvedUrl, filePath, accessToken.token);
                downloadSuccess = true;
                directMediaUrl = resolvedUrl; // Store the working URL
                console.log('   ✅ Download successful via resolved URL');
            } catch (urlError) {
                console.log(`   ❌ Resolved URL download failed: ${urlError.message}`);
            }
        }

        // Method 2: Try Chat API media download if we have a resource name
        if (!downloadSuccess && attachment.name && attachment.name.includes('spaces/')) {
            try {
                console.log('   🔧 Trying Google Chat API media download...');
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

        // Method 3: Try alternative URL constructions
        if (!downloadSuccess && attachment.attachmentToken) {
            const alternativeUrls = [
                // Try different size parameters
                `https://chat.google.com/api/get_attachment_url?url_type=DOWNLOAD_URL&content_type=${encodeURIComponent(attachment.contentType || 'application/octet-stream')}&attachment_token=${encodeURIComponent(attachment.attachmentToken)}`,
                `https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=${encodeURIComponent(attachment.contentType || 'application/octet-stream')}&attachment_token=${encodeURIComponent(attachment.attachmentToken)}&sz=s0`, // Original size
                // Try without size parameter
                `https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=${encodeURIComponent(attachment.contentType || 'application/octet-stream')}&attachment_token=${encodeURIComponent(attachment.attachmentToken)}`
            ];
            
            for (const altUrl of alternativeUrls) {
                try {
                    console.log(`   🔄 Trying alternative URL construction...`);
                    fileSize = await downloadWithAuth(altUrl, filePath, accessToken.token);
                    downloadSuccess = true;
                    directMediaUrl = altUrl;
                    console.log('   ✅ Download successful via alternative URL');
                    break;
                } catch (altError) {
                    console.log(`   ❌ Alternative URL failed: ${altError.message}`);
                }
            }
        }

        if (downloadSuccess && fileSize > 0) {
            // Verify the file is not an HTML error page
            let fileContent;
            try {
                fileContent = fs.readFileSync(filePath, 'utf8').substring(0, 200);
            } catch (e) {
                // File might be binary, which is fine
                fileContent = '';
            }
            
            if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE') || fileContent.includes('error')) {
                console.log(`❌ Downloaded file appears to be HTML error page, deleting...`);
                console.log(`   Content preview: ${fileContent.substring(0, 100)}`);
                fs.unlinkSync(filePath);
                return false;
            }

            console.log(`✅ Successfully downloaded: ${filename}`);
            console.log(`   File size: ${fileSize} bytes`);
            
            return {
                filename: filename,
                filePath: filePath,
                size: fileSize,
                directMediaUrl: directMediaUrl // Include the working direct URL
            };
        } else {
            console.log(`❌ All download methods failed for: ${attachment.contentName || 'attachment'}`);
            return false;
        }

    } catch (error) {
        console.log(`❌ Download error: ${error.message}`);
        return false;
    }
}

async function downloadAllGoogleChatMedia() {
    try {
        console.log('🚀 Starting enhanced Google Chat media download...');
        
        // Initialize APIs
        const authClient = await initializeGoogleAPIs();
        
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Find chats with attachments (focus on real chats starting with CMC)
        const allChats = await Chat.find({});
        const realChats = allChats.filter(chat => 
            chat.displayName && 
            chat.displayName.startsWith('CMC') &&
            chat.messages && 
            chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`\n📊 Found ${realChats.length} real CMC chats with attachments`);

        let totalAttachments = 0;
        let successfulDownloads = 0;
        let failedDownloads = 0;
        let skippedAttachments = 0;

        for (const chat of realChats) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        // Skip if already successfully downloaded (but not sample files)
                        if (attachment.localPath && 
                            !attachment.localPath.startsWith('sample_') && 
                            !attachment.localPath.startsWith('sample.') &&
                            attachment.downloadStatus === 'completed' &&
                            attachment.isRealMedia === true) {
                            console.log(`⏭️  Skipping already downloaded: ${attachment.contentName}`);
                            skippedAttachments++;
                            continue;
                        }
                        
                        console.log(`\n--- Processing attachment ${totalAttachments - skippedAttachments}/${totalAttachments - skippedAttachments} ---`);
                        
                        const result = await downloadGoogleChatAttachment(attachment, authClient);
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Update attachment in database with real local path and direct URL
                            message.attachments[attachmentIndex].downloadStatus = 'completed';
                            message.attachments[attachmentIndex].localPath = result.filename;
                            message.attachments[attachmentIndex].fileSize = result.size;
                            message.attachments[attachmentIndex].downloadedAt = new Date();
                            message.attachments[attachmentIndex].isRealMedia = true;
                            if (result.directMediaUrl) {
                                message.attachments[attachmentIndex].directMediaUrl = result.directMediaUrl;
                            }
                            
                            console.log(`💾 Updated database record`);
                        } else {
                            failedDownloads++;
                            message.attachments[attachmentIndex].downloadStatus = 'failed';
                            message.attachments[attachmentIndex].lastFailedAttempt = new Date();
                        }
                        
                        // Delay between downloads to be respectful
                        await new Promise(resolve => setTimeout(resolve, 2000));
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
            console.log(`\n🎉 Successfully downloaded ${successfulDownloads} Google Chat media files!`);
            console.log(`📁 Files saved to: ${path.join(__dirname, 'media')}`);
            console.log(`🌐 Direct URLs stored in database for frontend access`);
            console.log(`🔄 Refresh your frontend to see the media content!`);
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
downloadAllGoogleChatMedia().catch(console.error);
