const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeAuth() {
    try {
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error('dispatch.json service account file not found');
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Create service account auth (not domain-wide delegation)
        const auth = new google.auth.GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        });

        console.log('✓ Google Auth initialized');
        return auth;
        
    } catch (error) {
        console.error('❌ Failed to initialize Google Auth:', error.message);
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

async function downloadFromDirectUrl(url, filePath, authToken = null) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Upgrade-Insecure-Requests': '1'
                }
            };

            // Add authorization header if token provided
            if (authToken) {
                requestOptions.headers['Authorization'] = `Bearer ${authToken}`;
            }

            console.log(`   Making request to: ${urlObj.hostname}${urlObj.pathname.substring(0, 50)}...`);
            
            const request = https.request(requestOptions, (response) => {
                console.log(`   Response status: ${response.statusCode}`);
                console.log(`   Content-Type: ${response.headers['content-type']}`);
                
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
                    if (redirectUrl) {
                        console.log(`   Following redirect to: ${redirectUrl.substring(0, 100)}...`);
                        downloadFromDirectUrl(redirectUrl, filePath, authToken).then(resolve).catch(reject);
                    } else {
                        reject(new Error('Redirect without location header'));
                    }
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

async function downloadAttachmentDirect(attachment, authClient = null) {
    try {
        console.log(`\n📥 Downloading attachment: ${attachment.contentName || attachment.name || 'Unknown'}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Has downloadUrl: ${!!attachment.downloadUrl}`);
        console.log(`   Has thumbnailUrl: ${!!attachment.thumbnailUrl}`);

        // Generate filename with proper extension
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || attachment.name || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `direct_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        let downloadSuccess = false;
        let fileSize = 0;
        let workingUrl = null;
        let authToken = null;

        // Try to get auth token if auth client available
        if (authClient) {
            try {
                const client = await authClient.getClient();
                const tokenResponse = await client.getAccessToken();
                authToken = tokenResponse.token;
                console.log('   ✓ Got auth token');
            } catch (authError) {
                console.log(`   ⚠️  Failed to get auth token: ${authError.message}`);
            }
        }

        // Method 1: Try direct downloadUrl
        if (!downloadSuccess && attachment.downloadUrl) {
            try {
                console.log('   🌐 Attempting download from downloadUrl...');
                fileSize = await downloadFromDirectUrl(attachment.downloadUrl, filePath, authToken);
                downloadSuccess = true;
                workingUrl = attachment.downloadUrl;
                console.log('   ✅ Download successful via downloadUrl');
            } catch (urlError) {
                console.log(`   ❌ downloadUrl failed: ${urlError.message}`);
                
                // Try without authentication
                try {
                    console.log('   🔄 Retrying downloadUrl without auth...');
                    fileSize = await downloadFromDirectUrl(attachment.downloadUrl, filePath, null);
                    downloadSuccess = true;
                    workingUrl = attachment.downloadUrl;
                    console.log('   ✅ Download successful via downloadUrl (no auth)');
                } catch (noAuthError) {
                    console.log(`   ❌ downloadUrl (no auth) failed: ${noAuthError.message}`);
                }
            }
        }

        // Method 2: Try thumbnailUrl as fallback
        if (!downloadSuccess && attachment.thumbnailUrl && attachment.contentType?.startsWith('image/')) {
            try {
                console.log('   🖼️  Attempting download from thumbnailUrl...');
                fileSize = await downloadFromDirectUrl(attachment.thumbnailUrl, filePath, authToken);
                downloadSuccess = true;
                workingUrl = attachment.thumbnailUrl;
                console.log('   ✅ Download successful via thumbnailUrl (thumbnail version)');
            } catch (thumbError) {
                console.log(`   ❌ thumbnailUrl failed: ${thumbError.message}`);
                
                // Try thumbnail without authentication
                try {
                    console.log('   🔄 Retrying thumbnailUrl without auth...');
                    fileSize = await downloadFromDirectUrl(attachment.thumbnailUrl, filePath, null);
                    downloadSuccess = true;
                    workingUrl = attachment.thumbnailUrl;
                    console.log('   ✅ Download successful via thumbnailUrl (no auth)');
                } catch (thumbNoAuthError) {
                    console.log(`   ❌ thumbnailUrl (no auth) failed: ${thumbNoAuthError.message}`);
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
                directMediaUrl: workingUrl // Store the URL that worked
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

async function downloadAllDirectMedia() {
    try {
        console.log('🚀 Starting direct URL media download...');
        
        let authClient = null;
        try {
            authClient = await initializeAuth();
        } catch (authError) {
            console.log('⚠️  Will proceed without authentication');
        }
        
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
                        
                        const result = await downloadAttachmentDirect(attachment, authClient);
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Update attachment in database
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
            console.log(`\n🎉 Successfully downloaded ${successfulDownloads} media files!`);
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
downloadAllDirectMedia().catch(console.error);
