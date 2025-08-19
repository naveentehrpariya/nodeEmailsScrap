const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeDriveAPI() {
    const serviceAccountPath = path.join(__dirname, 'dispatch.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
        subject: 'naveendev@crossmilescarrier.com'
    });

    const drive = google.drive({ version: 'v3', auth });
    const chatApi = google.chat({ version: 'v1', auth });
    
    return { drive, chatApi, auth };
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

// Method 1: Try to find files in Drive by name and date
async function findFileInDrive(attachment, drive) {
    try {
        console.log('   🔍 Searching Google Drive by name...');
        
        const fileName = attachment.contentName || attachment.fileName;
        if (!fileName) {
            return null;
        }

        // Search for files with similar names
        const searchQuery = `name contains '${fileName.split('.')[0]}'`;
        console.log(`   📝 Search query: ${searchQuery}`);
        
        const response = await drive.files.list({
            q: searchQuery,
            fields: 'files(id, name, size, mimeType, createdTime, webContentLink, webViewLink)',
            pageSize: 10
        });

        const files = response.data.files;
        console.log(`   📊 Found ${files.length} potential matches`);

        if (files.length > 0) {
            // Try to find the best match
            const bestMatch = files.find(file => 
                file.name === fileName || 
                file.mimeType === attachment.contentType
            ) || files[0];

            console.log(`   🎯 Best match: ${bestMatch.name} (${bestMatch.id})`);
            return bestMatch;
        }

        return null;
    } catch (error) {
        console.log(`   ❌ Drive search failed: ${error.message}`);
        return null;
    }
}

// Method 2: Try to decode attachment resource name
async function decodeAttachmentResource(attachment) {
    try {
        console.log('   🔓 Decoding attachment resource...');
        
        if (!attachment.attachmentDataRef?.resourceName) {
            console.log('   ❌ No resource name available');
            return null;
        }

        const resourceName = attachment.attachmentDataRef.resourceName;
        console.log(`   📄 Resource name: ${resourceName.substring(0, 50)}...`);
        
        // Try base64 decoding
        try {
            const decoded = Buffer.from(resourceName, 'base64').toString('utf-8');
            console.log(`   🔓 Decoded: ${decoded.substring(0, 100)}...`);
            
            // Look for potential file IDs or paths
            const patterns = [
                /([a-zA-Z0-9_-]{25,})/g,  // Drive file ID pattern
                /\/([a-zA-Z0-9_-]+)$/,    // Path ending pattern
                /id[:=]([a-zA-Z0-9_-]+)/i // Explicit ID pattern
            ];
            
            for (const pattern of patterns) {
                const matches = decoded.match(pattern);
                if (matches) {
                    console.log(`   🆔 Found potential IDs: ${matches.join(', ')}`);
                    return { decoded, potentialIds: matches };
                }
            }
        } catch (decodeError) {
            console.log(`   ❌ Base64 decode failed: ${decodeError.message}`);
        }

        // Try URL decoding
        try {
            const urlDecoded = decodeURIComponent(resourceName);
            if (urlDecoded !== resourceName) {
                console.log(`   🔓 URL decoded: ${urlDecoded.substring(0, 100)}...`);
                return { decoded: urlDecoded };
            }
        } catch (urlError) {
            console.log(`   ❌ URL decode failed: ${urlError.message}`);
        }

        return null;
    } catch (error) {
        console.log(`   ❌ Resource decoding failed: ${error.message}`);
        return null;
    }
}

// Method 3: Try to download file from Drive using various approaches
async function downloadFromDriveMultiple(fileInfo, attachment, drive) {
    try {
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const timestamp = Date.now();
        const safeName = (attachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `drive_${timestamp}_${safeName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        // Try different methods to download
        const downloadMethods = [
            {
                name: 'Direct file download',
                method: async () => {
                    const response = await drive.files.get({
                        fileId: fileInfo.id,
                        alt: 'media'
                    });
                    return response.data;
                }
            },
            {
                name: 'Export as PDF (for docs)',
                method: async () => {
                    if (fileInfo.mimeType?.includes('document') || fileInfo.mimeType?.includes('spreadsheet')) {
                        const response = await drive.files.export({
                            fileId: fileInfo.id,
                            mimeType: 'application/pdf'
                        });
                        return response.data;
                    }
                    throw new Error('Not a document type');
                }
            },
            {
                name: 'Web content link',
                method: async () => {
                    if (fileInfo.webContentLink) {
                        // This would require additional HTTP request handling
                        throw new Error('Web content link method not implemented');
                    }
                    throw new Error('No web content link');
                }
            }
        ];

        for (const method of downloadMethods) {
            try {
                console.log(`   🔄 Trying ${method.name}...`);
                const data = await method.method();
                
                if (data) {
                    // Write the data to file
                    if (typeof data === 'string') {
                        fs.writeFileSync(filePath, data, 'utf8');
                    } else if (Buffer.isBuffer(data)) {
                        fs.writeFileSync(filePath, data);
                    } else {
                        // Handle stream or other data types
                        const buffer = Buffer.from(data);
                        fs.writeFileSync(filePath, buffer);
                    }
                    
                    const fileSize = fs.statSync(filePath).size;
                    console.log(`   ✅ Downloaded via ${method.name}: ${fileSize} bytes`);
                    
                    return { filename, filePath, size: fileSize };
                }
            } catch (methodError) {
                console.log(`   ❌ ${method.name} failed: ${methodError.message}`);
            }
        }

        return null;
    } catch (error) {
        console.log(`   💥 Download error: ${error.message}`);
        return null;
    }
}

async function downloadMediaViaDrive(attachment) {
    try {
        console.log(`\n🚗 DRIVE APPROACH: ${attachment.contentName}`);
        console.log(`   Type: ${attachment.contentType}`);

        const { drive, chatApi, auth } = await initializeDriveAPI();

        // Method 1: Search Drive by filename
        const driveFile = await findFileInDrive(attachment, drive);
        if (driveFile) {
            const result = await downloadFromDriveMultiple(driveFile, attachment, drive);
            if (result) {
                console.log(`✅ SUCCESS via Drive search!`);
                return result;
            }
        }

        // Method 2: Try decoding resource name
        const resourceInfo = await decodeAttachmentResource(attachment);
        if (resourceInfo && resourceInfo.potentialIds) {
            for (const potentialId of resourceInfo.potentialIds) {
                try {
                    console.log(`   🔄 Trying potential ID: ${potentialId}`);
                    
                    // Check if this ID exists in Drive
                    const fileInfo = await drive.files.get({
                        fileId: potentialId,
                        fields: 'id, name, size, mimeType, webContentLink'
                    });
                    
                    if (fileInfo.data) {
                        console.log(`   ✅ Found file: ${fileInfo.data.name}`);
                        const result = await downloadFromDriveMultiple(fileInfo.data, attachment, drive);
                        if (result) {
                            console.log(`✅ SUCCESS via resource decoding!`);
                            return result;
                        }
                    }
                } catch (idError) {
                    console.log(`   ❌ ID ${potentialId} failed: ${idError.message}`);
                }
            }
        }

        console.log(`💥 All Drive methods failed`);
        return false;

    } catch (error) {
        console.log(`💥 Drive approach error: ${error.message}`);
        return false;
    }
}

async function downloadAllMediaViaDrive() {
    try {
        console.log('🚗 GOOGLE DRIVE APPROACH - Accessing Chat media via Drive API...\n');
        
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

        // Process CMC chat first
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
                            attachment.localPath.startsWith('drive_') && 
                            attachment.downloadStatus === 'completed') {
                            console.log(`⏭️  Skipping already downloaded: ${attachment.contentName}`);
                            continue;
                        }
                        
                        const result = await downloadMediaViaDrive(attachment);
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Verify file is valid
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
                                attachment.isDriveMedia = true;
                                
                                console.log(`💾 Database updated for Drive media!`);
                            }
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

        console.log(`\n🚗 DRIVE DOWNLOAD RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   ✅ Successful downloads: ${successfulDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${totalAttachments > 0 ? ((successfulDownloads / totalAttachments) * 100).toFixed(1) : 0}%`);

        if (successfulDownloads > 0) {
            console.log(`\n🎉 DRIVE SUCCESS! Downloaded ${successfulDownloads} files!`);
            console.log(`📁 Files saved to: ${path.join(__dirname, 'media')}`);
            console.log(`🔄 Refresh your frontend to see the real media!`);
        } else {
            console.log(`\n😔 Drive approach failed. Media may not be stored in accessible Drive locations.`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Done with Drive approach');
    }
}

downloadAllMediaViaDrive().catch(console.error);
