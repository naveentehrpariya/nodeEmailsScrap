const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeChatAPI() {
    try {
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error('dispatch.json service account file not found');
        }

        // Simple service account auth without domain-wide delegation
        const auth = new google.auth.GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly'
            ]
        });

        const chatApi = google.chat({ version: 'v1', auth });
        console.log('✓ Google Chat API initialized');
        
        return { chatApi, auth };
        
    } catch (error) {
        console.error('❌ Failed to initialize Google Chat API:', error.message);
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

async function downloadViaChatAPI(attachment, chatApi, auth) {
    try {
        console.log(`\n📥 Downloading via Chat API: ${attachment.contentName || attachment.name || 'Unknown'}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Resource: ${attachment.name}`);

        if (!attachment.name || !attachment.name.includes('spaces/')) {
            console.log('❌ No valid resource name found');
            return false;
        }

        // Generate filename with proper extension
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || attachment.name || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `chatapi_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        // Try multiple approaches to download

        // Method 1: Direct media.download with resource name
        try {
            console.log('   🔧 Trying Chat API media.download...');
            const response = await chatApi.media.download({
                resourceName: attachment.name
            });
            
            if (response.data) {
                console.log('   ✓ Got data from Chat API media.download');
                fs.writeFileSync(filePath, response.data);
                const fileSize = fs.statSync(filePath).size;
                
                console.log(`✅ Successfully downloaded: ${filename}`);
                console.log(`   File size: ${fileSize} bytes`);
                
                return {
                    filename: filename,
                    filePath: filePath,
                    size: fileSize,
                    directMediaUrl: null // Chat API doesn't provide direct URLs
                };
            }
        } catch (apiError) {
            console.log(`   ❌ Chat API media.download failed: ${apiError.message}`);
        }

        // Method 2: Try to get attachment details and download URL
        try {
            console.log('   🔍 Trying to get attachment details...');
            
            // Parse resource name to get space and message IDs
            const resourceParts = attachment.name.split('/');
            if (resourceParts.length >= 6) {
                const spaceId = resourceParts[1];
                const messageId = resourceParts[3];
                
                console.log(`   Space: ${spaceId}, Message: ${messageId}`);
                
                // Try to get message details
                const messageResponse = await chatApi.spaces.messages.get({
                    name: `spaces/${spaceId}/messages/${messageId}`
                });
                
                if (messageResponse.data && messageResponse.data.attachment) {
                    console.log('   ✓ Got message details');
                    console.log(`   Message data:`, JSON.stringify(messageResponse.data, null, 2));
                }
            }
        } catch (detailError) {
            console.log(`   ❌ Failed to get attachment details: ${detailError.message}`);
        }

        // Method 3: Try alternative Chat API endpoints
        try {
            console.log('   🔄 Trying alternative Chat API approach...');
            
            // Get access token for manual API calls
            const client = await auth.getClient();
            const accessToken = await client.getAccessToken();
            
            if (accessToken?.token) {
                console.log('   ✓ Got access token for manual API call');
                
                // Try direct API call to the attachment resource
                const https = require('https');
                const { URL } = require('url');
                
                const apiUrl = `https://chat.googleapis.com/v1/${attachment.name}`;
                const urlObj = new URL(apiUrl);
                
                await new Promise((resolve, reject) => {
                    const options = {
                        hostname: urlObj.hostname,
                        path: urlObj.pathname,
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken.token}`,
                            'Accept': '*/*'
                        }
                    };
                    
                    const request = https.request(options, (response) => {
                        console.log(`   API response status: ${response.statusCode}`);
                        console.log(`   API response headers:`, Object.keys(response.headers));
                        
                        if (response.statusCode === 200) {
                            const fileStream = fs.createWriteStream(filePath);
                            let downloadedBytes = 0;
                            
                            response.on('data', (chunk) => {
                                downloadedBytes += chunk.length;
                            });
                            
                            response.pipe(fileStream);
                            
                            fileStream.on('finish', () => {
                                fileStream.close();
                                console.log(`   Downloaded ${downloadedBytes} bytes via manual API`);
                                resolve(downloadedBytes);
                            });
                            
                            fileStream.on('error', reject);
                        } else {
                            let errorBody = '';
                            response.on('data', chunk => errorBody += chunk);
                            response.on('end', () => {
                                console.log(`   API error response: ${errorBody.substring(0, 200)}`);
                                reject(new Error(`API HTTP ${response.statusCode}: ${errorBody.substring(0, 100)}`));
                            });
                        }
                    });
                    
                    request.on('error', reject);
                    request.setTimeout(60000, () => {
                        request.abort();
                        reject(new Error('API timeout'));
                    });
                    
                    request.end();
                });
                
                const fileSize = fs.statSync(filePath).size;
                if (fileSize > 0) {
                    console.log(`✅ Successfully downloaded via manual API: ${filename}`);
                    console.log(`   File size: ${fileSize} bytes`);
                    
                    return {
                        filename: filename,
                        filePath: filePath,
                        size: fileSize,
                        directMediaUrl: null
                    };
                }
            }
        } catch (manualError) {
            console.log(`   ❌ Manual API call failed: ${manualError.message}`);
        }

        console.log(`❌ All download methods failed for: ${attachment.contentName || 'attachment'}`);
        return false;

    } catch (error) {
        console.log(`❌ Download error: ${error.message}`);
        return false;
    }
}

async function downloadAllChatAPIMedia() {
    try {
        console.log('🚀 Starting Chat API media download...');
        
        // Initialize Chat API
        const { chatApi, auth } = await initializeChatAPI();
        
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
                        
                        const result = await downloadViaChatAPI(attachment, chatApi, auth);
                        
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
            console.log(`\n🎉 Successfully downloaded ${successfulDownloads} media files!`);
            console.log(`📁 Files saved to: ${path.join(__dirname, 'media')}`);
            console.log(`🔄 Refresh your frontend to see the media content!`);
        } else if (skippedAttachments > 0) {
            console.log(`\n✨ All ${skippedAttachments} media files were already downloaded!`);
        } else {
            console.log(`\n😕 No media files were successfully downloaded. Check the errors above.`);
            console.log(`\n💡 Troubleshooting tips:`);
            console.log(`   1. Verify service account has Chat API access`);
            console.log(`   2. Check if attachments require user authentication`);
            console.log(`   3. Consider using OAuth2 flow for user access`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from database');
    }
}

// Run the downloader
downloadAllChatAPIMedia().catch(console.error);
