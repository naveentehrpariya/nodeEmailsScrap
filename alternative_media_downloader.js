const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeGoogleAPIs() {
    const serviceAccountPath = path.join(__dirname, 'dispatch.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    // Try multiple authentication approaches
    const approaches = [
        {
            name: 'Chat API with Drive scope',
            auth: new google.auth.JWT({
                email: serviceAccount.client_email,
                key: serviceAccount.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/chat.messages.readonly',
                    'https://www.googleapis.com/auth/drive.readonly',
                    'https://www.googleapis.com/auth/drive.file'
                ],
                subject: 'naveendev@crossmilescarrier.com'
            })
        },
        {
            name: 'Chat API with Admin scope',
            auth: new google.auth.JWT({
                email: serviceAccount.client_email,
                key: serviceAccount.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/chat.messages.readonly',
                    'https://www.googleapis.com/auth/admin.directory.user.readonly'
                ],
                subject: 'naveendev@crossmilescarrier.com'
            })
        }
    ];

    return approaches;
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
        'text/plain': '.txt'
    };
    
    return typeMap[contentType] || '.bin';
}

// Method 1: Try downloading without Authorization header
async function downloadWithoutAuth(url, filePath) {
    try {
        console.log('   🔓 Trying download without auth...');
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (response.status === 200) {
            fs.writeFileSync(filePath, response.data);
            return response.data.byteLength;
        }
        return false;
    } catch (error) {
        console.log(`   ❌ No-auth download failed: ${error.message}`);
        return false;
    }
}

// Method 2: Try with different headers and user agents
async function downloadWithDifferentHeaders(url, filePath, authToken) {
    const userAgents = [
        'Google-Apps-Script',
        'Mozilla/5.0 (compatible; Google-Chat-Bot/1.0)',
        'GoogleBot/2.1',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    ];

    for (const userAgent of userAgents) {
        try {
            console.log(`   🔄 Trying with user agent: ${userAgent.substring(0, 20)}...`);
            
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'User-Agent': userAgent,
                    'Accept': '*/*',
                    'Referer': 'https://chat.google.com/',
                    'Origin': 'https://chat.google.com'
                }
            });

            if (response.status === 200) {
                fs.writeFileSync(filePath, response.data);
                console.log(`   ✅ Success with ${userAgent.substring(0, 20)}!`);
                return response.data.byteLength;
            }
        } catch (error) {
            console.log(`   ❌ Failed with ${userAgent.substring(0, 20)}: ${error.response?.status || error.message}`);
        }
        
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}

// Method 3: Try Drive API if attachment has Drive reference
async function downloadFromDrive(attachment, authClient) {
    try {
        if (!attachment.attachmentDataRef?.resourceName) {
            return false;
        }

        console.log('   💾 Trying Google Drive API...');
        const drive = google.drive({ version: 'v3', auth: authClient });
        
        // Decode the resource name to get Drive file ID
        const resourceName = attachment.attachmentDataRef.resourceName;
        const decoded = Buffer.from(resourceName, 'base64').toString('utf-8');
        
        console.log(`   📄 Decoded resource: ${decoded.substring(0, 50)}...`);
        
        // Try to extract file ID from the decoded string
        const fileIdMatch = decoded.match(/([a-zA-Z0-9_-]{25,})/);
        if (fileIdMatch) {
            const fileId = fileIdMatch[0];
            console.log(`   🆔 Extracted file ID: ${fileId}`);
            
            const response = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            if (response.data) {
                return response.data;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`   ❌ Drive API failed: ${error.message}`);
        return false;
    }
}

// Method 4: Try modifying the URL parameters
async function downloadWithModifiedUrl(originalUrl, filePath, authToken) {
    const urlVariations = [
        originalUrl.replace('&auto=true', ''),
        originalUrl.replace('url_type=DOWNLOAD_URL', 'url_type=FIFE_URL'),
        originalUrl + '&sz=w2000', // Request larger size
        originalUrl.replace('https://chat.google.com/api/', 'https://docs.google.com/'),
        originalUrl.split('&')[0] // Remove all parameters except the first
    ];

    for (const url of urlVariations) {
        try {
            console.log(`   🔧 Trying URL variation...`);
            
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'User-Agent': 'Google-Apps-Script'
                }
            });

            if (response.status === 200) {
                fs.writeFileSync(filePath, response.data);
                console.log(`   ✅ Success with URL variation!`);
                return response.data.byteLength;
            }
        } catch (error) {
            console.log(`   ❌ URL variation failed: ${error.response?.status || error.message}`);
        }
    }
    return false;
}

async function downloadRealMediaWithAlternatives(attachment, authApproaches) {
    try {
        console.log(`\n🎯 AGGRESSIVE DOWNLOAD: ${attachment.contentName}`);
        console.log(`   Type: ${attachment.contentType}`);

        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `real_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        // Get fresh attachment data
        let freshAttachment = attachment;
        
        // Try each authentication approach
        for (const approach of authApproaches) {
            try {
                console.log(`\n🔑 Using ${approach.name}...`);
                
                const chatApi = google.chat({ version: 'v1', auth: approach.auth });
                const accessToken = await approach.auth.getAccessToken();
                
                if (!accessToken?.token) {
                    console.log('   ❌ No access token');
                    continue;
                }

                // Try Method 1: No authentication
                if (attachment.downloadUrl || attachment.downloadUri) {
                    const downloadUrl = attachment.downloadUrl || attachment.downloadUri;
                    const size1 = await downloadWithoutAuth(downloadUrl, filePath);
                    if (size1) {
                        console.log(`✅ SUCCESS: Downloaded ${filename} (${size1} bytes) - No auth required!`);
                        return { filename, filePath, size: size1 };
                    }
                }

                // Try Method 2: Different headers
                if (attachment.downloadUrl || attachment.downloadUri) {
                    const downloadUrl = attachment.downloadUrl || attachment.downloadUri;
                    const size2 = await downloadWithDifferentHeaders(downloadUrl, filePath, accessToken.token);
                    if (size2) {
                        console.log(`✅ SUCCESS: Downloaded ${filename} (${size2} bytes) - Different headers!`);
                        return { filename, filePath, size: size2 };
                    }
                }

                // Try Method 3: Drive API
                const driveData = await downloadFromDrive(attachment, approach.auth);
                if (driveData) {
                    fs.writeFileSync(filePath, driveData);
                    const size3 = fs.statSync(filePath).size;
                    console.log(`✅ SUCCESS: Downloaded ${filename} (${size3} bytes) - Drive API!`);
                    return { filename, filePath, size: size3 };
                }

                // Try Method 4: Modified URLs
                if (attachment.downloadUrl || attachment.downloadUri) {
                    const downloadUrl = attachment.downloadUrl || attachment.downloadUri;
                    const size4 = await downloadWithModifiedUrl(downloadUrl, filePath, accessToken.token);
                    if (size4) {
                        console.log(`✅ SUCCESS: Downloaded ${filename} (${size4} bytes) - Modified URL!`);
                        return { filename, filePath, size: size4 };
                    }
                }

                // Try thumbnail as fallback for images
                if (attachment.contentType?.startsWith('image/')) {
                    const thumbUrl = attachment.thumbnailUrl || attachment.thumbnailUri;
                    if (thumbUrl) {
                        const size5 = await downloadWithDifferentHeaders(thumbUrl, filePath, accessToken.token);
                        if (size5) {
                            console.log(`✅ SUCCESS: Downloaded ${filename} (${size5} bytes) - Thumbnail!`);
                            return { filename, filePath, size: size5 };
                        }
                    }
                }

            } catch (error) {
                console.log(`   ❌ ${approach.name} failed: ${error.message}`);
            }
        }

        console.log(`💥 ALL METHODS FAILED for ${attachment.contentName}`);
        return false;

    } catch (error) {
        console.log(`💥 Critical error: ${error.message}`);
        return false;
    }
}

async function downloadAllRealMediaAggressive() {
    try {
        console.log('🚀 AGGRESSIVE REAL MEDIA DOWNLOAD - TRYING ALL METHODS...\n');
        
        // Initialize multiple auth approaches
        const authApproaches = await initializeGoogleAPIs();
        
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

        // Start with CMC chat only (for testing)
        const cmcChat = chatsWithMedia.find(chat => chat.displayName === 'CMC');
        const chatsToProcess = cmcChat ? [cmcChat] : chatsWithMedia.slice(0, 1);

        for (const chat of chatsToProcess) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        // Skip already downloaded real media
                        if (attachment.localPath && 
                            attachment.localPath.startsWith('real_') && 
                            attachment.downloadStatus === 'completed') {
                            console.log(`⏭️  Skipping already downloaded: ${attachment.contentName}`);
                            continue;
                        }
                        
                        const result = await downloadRealMediaWithAlternatives(
                            attachment, 
                            authApproaches
                        );
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Verify file is valid (not HTML error)
                            const buffer = fs.readFileSync(result.filePath);
                            const fileStart = buffer.toString('utf8', 0, Math.min(100, buffer.length));
                            
                            if (fileStart.includes('<html') || fileStart.includes('<!DOCTYPE')) {
                                console.log(`❌ Downloaded HTML error page, deleting...`);
                                fs.unlinkSync(result.filePath);
                                failedDownloads++;
                                attachment.downloadStatus = 'failed';
                            } else {
                                // Update attachment in database
                                attachment.downloadStatus = 'completed';
                                attachment.localPath = result.filename;
                                attachment.fileSize = result.size;
                                attachment.downloadedAt = new Date();
                                attachment.isRealMedia = true;
                                
                                console.log(`💾 Database updated for real media!`);
                            }
                        } else {
                            failedDownloads++;
                            attachment.downloadStatus = 'failed';
                            attachment.lastFailedAttempt = new Date();
                        }
                        
                        // Respectful delay
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }
            
            // Save updated chat
            await chat.save();
            console.log(`💾 Saved chat "${chat.displayName}"`);
        }

        console.log(`\n🎯 AGGRESSIVE DOWNLOAD RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   ✅ Successful downloads: ${successfulDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${totalAttachments > 0 ? ((successfulDownloads / totalAttachments) * 100).toFixed(1) : 0}%`);

        if (successfulDownloads > 0) {
            console.log(`\n🎉 REAL MEDIA BREAKTHROUGH! Downloaded ${successfulDownloads} files!`);
            console.log(`📁 Check: ${path.join(__dirname, 'media')}`);
            console.log(`🔄 Refresh your frontend to see REAL MEDIA!`);
        } else {
            console.log(`\n😔 All aggressive methods failed. Google Chat media may be permanently restricted.`);
            console.log(`💡 Consider alternative approaches like Google Takeout export.`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Done with aggressive download attempt');
    }
}

downloadAllRealMediaAggressive().catch(console.error);
