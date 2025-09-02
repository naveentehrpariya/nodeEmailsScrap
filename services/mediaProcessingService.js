const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const sharp = require('sharp');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');

class MediaProcessingService {
    constructor() {
        this.mediaDirectory = path.join(__dirname, '../media');
        this.thumbnailDirectory = path.join(__dirname, '../media/thumbnails');
        this.supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        this.supportedVideoTypes = ['video/mp4', 'video/webm', 'video/avi', 'video/mov', 'video/wmv'];
        this.supportedAudioTypes = ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
        this.supportedDocumentTypes = [
            'application/pdf', 
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv'
        ];
        this.supportedArchiveTypes = ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'];
    }

    // Check if attachment file already exists to prevent duplicates
    async fileAlreadyExists(filename) {
        try {
            const sanitizedName = this.sanitizeFileName(filename);
            const files = await fs.readdir(this.mediaDirectory);
            
            // Look for any file that contains the base filename (ignoring timestamp prefix)
            const existingFile = files.find(file => {
                const nameWithoutTimestamp = file.replace(/^\d+_/, '');
                return nameWithoutTimestamp === sanitizedName;
            });
            
            if (existingFile) {
                const fullPath = path.join(this.mediaDirectory, existingFile);
                const stats = await fs.stat(fullPath);
                
                if (stats.size > 0) {
                    console.log(`    ♻️ File already exists: ${existingFile} (${(stats.size/1024).toFixed(1)}KB)`);
                    return {
                        exists: true,
                        path: `/media/${existingFile}`,
                        size: stats.size
                    };
                } else {
                    // Delete 0-byte corrupted file
                    await fs.unlink(fullPath);
                    console.log(`    🗑️ Removed 0-byte file: ${existingFile}`);
                }
            }
            
            return { exists: false };
        } catch (error) {
            return { exists: false };
        }
    }

    // Initialize directories
    async initialize() {
        try {
            await fs.mkdir(this.mediaDirectory, { recursive: true });
            await fs.mkdir(this.thumbnailDirectory, { recursive: true });
            console.log('📁 Media directories initialized');
        } catch (error) {
            console.error('Failed to initialize media directories:', error);
        }
    }

    // Classify media type based on MIME type
    classifyMediaType(mimeType) {
        if (!mimeType) return 'other';
        
        if (this.supportedImageTypes.includes(mimeType)) return 'image';
        if (this.supportedVideoTypes.includes(mimeType)) return 'video';
        if (this.supportedAudioTypes.includes(mimeType)) return 'audio';
        if (this.supportedDocumentTypes.includes(mimeType)) return 'document';
        if (this.supportedArchiveTypes.includes(mimeType)) return 'archive';
        
        return 'other';
    }

    // Process attachments from Google Chat message (for chat controller)
    async processMessageAttachments(messageData) {
        if (!messageData.attachments || messageData.attachments.length === 0) {
            return [];
        }

        console.log(`📎 Processing ${messageData.attachments.length} attachments for message ${messageData.messageId}`);
        
        const processedAttachments = [];
        
        for (const attachment of messageData.attachments) {
            try {
                const processed = await this.processAttachmentFromChat(attachment, messageData);
                processedAttachments.push(processed);
            } catch (error) {
                console.error(`Failed to process attachment ${attachment.name}:`, error);
                processedAttachments.push({
                    ...attachment,
                    mediaType: 'other',
                    downloadStatus: 'failed',
                    downloadError: error.message,
                    isImage: false,
                    isVideo: false,
                    isAudio: false,
                    isDocument: false
                });
            }
        }
        
        return processedAttachments;
    }
    
    // Enhanced process attachments with automatic download during sync
    async processMessageAttachmentsWithAuth(message, auth) {
        const attachments = message.attachments || message.attachment || [];
        if (!attachments || attachments.length === 0) {
            return [];
        }

        console.log(`📎 Processing ${attachments.length} attachments for message ${message.name}`);
        
        const processedAttachments = [];
        
        for (const attachment of attachments) {
            try {
                const processed = await this.processGoogleChatAttachment(attachment, message, auth);
                
                // NEW: Automatically attempt to download the media file during sync
                if (processed.filename && !processed.localPath) {
                    // ENHANCEMENT: Check if file already exists to prevent duplicates
                    const existingFile = await this.fileAlreadyExists(processed.filename);
                    if (existingFile.exists) {
                        processed.localPath = existingFile.path;
                        processed.downloadStatus = 'completed';
                        processed.fileSize = existingFile.size;
                        processed.wasAlreadyDownloaded = true;
                        console.log(`  ♻️ Skipped download (already exists): ${processed.filename}`);
                    } else {
                        console.log(`  📥 Attempting to download: ${processed.filename}`);
                        
                        // Try multiple download strategies - prioritizing PROVEN methods
                        let downloadResult = null;
                        
                        // Strategy 1: Try PROVEN Google Chat direct download method FIRST
                        if (processed.downloadUri || processed.thumbnailUri || processed.source?.attachmentToken) {
                            console.log(`  🔗 Attempting PROVEN Google Chat direct download...`);
                            downloadResult = await this.downloadFromGoogleChatDirect(processed, auth);
                        }
                        
                        // Strategy 2: Try Chat API media download (if direct fails)
                        if (!downloadResult && processed.attachmentDataRef?.resourceName) {
                            console.log(`  🗨️ Attempting Chat API media download...`);
                            downloadResult = await this.downloadFromChatAPI(processed, auth);
                        }
                        
                        // Strategy 3: Try Gmail API (if other methods fail)
                        if (!downloadResult && processed.filename) {
                            console.log(`  📧 Attempting Gmail API download...`);
                            downloadResult = await this.downloadAttachmentViaGmail(processed, auth);
                        }
                        
                        if (downloadResult) {
                            processed.localPath = downloadResult.localPath;
                            processed.downloadStatus = 'completed';
                            processed.fileSize = downloadResult.fileSize;
                            console.log(`  ✅ Downloaded: ${processed.filename} (${Math.round(downloadResult.fileSize/1024)}KB)`);
                        } else {
                            console.log(`  ⚠️ Could not download: ${processed.filename}`);
                            processed.downloadStatus = 'failed';
                            processed.downloadError = 'No download method succeeded';
                        }
                    }
                }
                
                processedAttachments.push(processed);
                console.log(`✅ Processed attachment: ${attachment.contentName} (${processed.mediaType})`);
            } catch (error) {
                console.error(`Failed to process attachment ${attachment.contentName}:`, error.message);
                processedAttachments.push({
                    ...attachment,
                    filename: attachment.contentName,
                    fileName: attachment.contentName,
                    mimeType: attachment.contentType,
                    mediaType: this.classifyMediaType(attachment.contentType),
                    downloadStatus: 'failed',
                    downloadError: error.message,
                    isImage: this.supportedImageTypes.includes(attachment.contentType),
                    isVideo: this.supportedVideoTypes.includes(attachment.contentType),
                    isAudio: this.supportedAudioTypes.includes(attachment.contentType),
                    isDocument: this.supportedDocumentTypes.includes(attachment.contentType)
                });
            }
        }
        
        return processedAttachments;
    }
    
    // Process Google Chat specific attachment
    async processGoogleChatAttachment(attachment, message, auth) {
        const processed = {
            // Copy original data
            name: attachment.name,
            contentName: attachment.contentName,
            contentType: attachment.contentType,
            source: attachment.source,
            downloadUri: attachment.downloadUri,
            thumbnailUri: attachment.thumbnailUri,
            attachmentDataRef: attachment.attachmentDataRef,
            driveDataRef: attachment.driveDataRef,
            
            // Enhanced fields
            filename: attachment.contentName,
            fileName: attachment.contentName,
            mimeType: attachment.contentType,
            mediaType: this.classifyMediaType(attachment.contentType),
            downloadStatus: 'completed', // Google Chat provides direct URLs
            
            // Set boolean flags
            isImage: this.supportedImageTypes.includes(attachment.contentType),
            isVideo: this.supportedVideoTypes.includes(attachment.contentType),
            isAudio: this.supportedAudioTypes.includes(attachment.contentType),
            isDocument: this.supportedDocumentTypes.includes(attachment.contentType),
            
            createdAt: new Date()
        };

        // For Google Chat attachments, we have direct URLs but they require authentication
        // We can indicate they're available for display
        if (attachment.downloadUri) {
            processed.downloadStatus = 'completed';
            processed.downloadUrl = attachment.downloadUri; // For compatibility
        }
        
        if (attachment.thumbnailUri) {
            processed.thumbnailUrl = attachment.thumbnailUri;
            processed.hasThumbnail = true;
        }

        console.log(`📎 Processed Google Chat attachment: ${attachment.contentName} as ${processed.mediaType}`);
        
        return processed;
    }
    
    // Process individual attachment from chat data (without auth)
    async processAttachmentFromChat(attachment, messageData) {
        const processed = {
            // Copy original data
            name: attachment.name,
            contentType: attachment.contentType,
            contentName: attachment.contentName,
            
            // Enhanced fields
            filename: attachment.name,
            fileName: attachment.name,
            mimeType: attachment.contentType,
            mediaType: this.classifyMediaType(attachment.contentType),
            downloadStatus: 'failed',
            
            // Set boolean flags
            isImage: this.supportedImageTypes.includes(attachment.contentType),
            isVideo: this.supportedVideoTypes.includes(attachment.contentType),
            isAudio: this.supportedAudioTypes.includes(attachment.contentType),
            isDocument: this.supportedDocumentTypes.includes(attachment.contentType),
            
            // Google Chat attachments often don't have direct download URLs
            // Mark as not downloadable for now
            downloadError: 'Google Chat attachments require special handling',
            
            createdAt: new Date()
        };
        
        console.log(`📎 Classified ${attachment.name} as ${processed.mediaType}`);
        
        return processed;
    }

    // Process individual attachment
    async processAttachment(attachment, message, auth) {
        const processed = {
            // Copy original data
            name: attachment.name,
            contentType: attachment.contentType,
            contentName: attachment.contentName,
            attachmentDataRef: attachment.attachmentDataRef,
            driveDataRef: attachment.driveDataRef,
            
            // Enhanced fields
            filename: attachment.name,
            fileName: attachment.name,
            mimeType: attachment.contentType,
            mediaType: this.classifyMediaType(attachment.contentType),
            downloadStatus: 'pending',
            
            // Set boolean flags
            isImage: this.supportedImageTypes.includes(attachment.contentType),
            isVideo: this.supportedVideoTypes.includes(attachment.contentType),
            isAudio: this.supportedAudioTypes.includes(attachment.contentType),
            isDocument: this.supportedDocumentTypes.includes(attachment.contentType),
            
            createdAt: new Date()
        };

        // Try to get file size and download URL
        try {
            if (attachment.driveDataRef?.driveFileId) {
                // Handle Google Drive files
                const driveData = await this.getDriveFileInfo(attachment.driveDataRef.driveFileId, auth);
                processed.fileSize = driveData.size;
                processed.size = driveData.size;
                processed.downloadUrl = driveData.downloadUrl;
                processed.thumbnailUrl = driveData.thumbnailUrl;
            } else if (attachment.attachmentDataRef?.resourceName) {
                // Handle direct Chat attachments
                const attachmentData = await this.getChatAttachmentInfo(attachment, message, auth);
                processed.fileSize = attachmentData.size;
                processed.size = attachmentData.size;
                processed.downloadUrl = attachmentData.downloadUrl;
            }

            // Download the file if it's not too large (< 50MB)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (processed.fileSize && processed.fileSize < maxSize && processed.downloadUrl) {
                await this.downloadAttachment(processed, auth);
            } else {
                processed.downloadStatus = 'skipped';
                if (processed.fileSize >= maxSize) {
                    processed.downloadError = 'File too large to download';
                }
            }

        } catch (error) {
            console.error(`Error processing attachment ${attachment.name}:`, error);
            processed.downloadStatus = 'failed';
            processed.downloadError = error.message;
        }

        return processed;
    }

    // Get Google Drive file information
    async getDriveFileInfo(driveFileId, auth) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            
            const fileRes = await drive.files.get({
                fileId: driveFileId,
                fields: 'id,name,mimeType,size,thumbnailLink,webContentLink'
            });
            
            const file = fileRes.data;
            
            return {
                size: parseInt(file.size) || 0,
                downloadUrl: file.webContentLink,
                thumbnailUrl: file.thumbnailLink
            };
        } catch (error) {
            console.error('Failed to get Drive file info:', error);
            throw error;
        }
    }

    // Get Chat attachment information
    async getChatAttachmentInfo(attachment, message, auth) {
        try {
            // For Chat API attachments, we need to use the attachment resource
            const chat = google.chat({ version: 'v1', auth });
            
            // Try to get attachment data (this might not be available for all attachments)
            if (attachment.attachmentDataRef?.resourceName) {
                const attachmentRes = await chat.media.download({
                    resourceName: attachment.attachmentDataRef.resourceName
                });
                
                return {
                    size: attachmentRes.headers['content-length'] ? parseInt(attachmentRes.headers['content-length']) : 0,
                    downloadUrl: null, // We'll need to use the resourceName for download
                    data: attachmentRes.data
                };
            }
            
            return {
                size: 0,
                downloadUrl: null
            };
        } catch (error) {
            console.error('Failed to get Chat attachment info:', error);
            return {
                size: 0,
                downloadUrl: null
            };
        }
    }

    // Download attachment to local storage
    async downloadAttachment(attachment, auth) {
        try {
            attachment.downloadStatus = 'downloading';
            
            const fileName = this.sanitizeFileName(attachment.filename || attachment.name || 'unknown');
            const fileExtension = path.extname(fileName) || this.getExtensionFromMimeType(attachment.mimeType);
            const safeFileName = `${Date.now()}_${fileName}${fileExtension}`;
            const localPath = path.join(this.mediaDirectory, safeFileName);
            
            let fileData;
            
            if (attachment.downloadUrl) {
                // Download from URL (Google Drive files)
                const response = await axios({
                    method: 'GET',
                    url: attachment.downloadUrl,
                    responseType: 'stream',
                    headers: {
                        'Authorization': `Bearer ${await auth.getAccessToken()}`
                    }
                });
                
                const writeStream = require('fs').createWriteStream(localPath);
                response.data.pipe(writeStream);
                
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                
            } else if (attachment.attachmentDataRef?.resourceName) {
                // Download via Chat API
                const chat = google.chat({ version: 'v1', auth });
                const attachmentRes = await chat.media.download({
                    resourceName: attachment.attachmentDataRef.resourceName
                });
                
                await fs.writeFile(localPath, attachmentRes.data);
                fileData = attachmentRes.data;
            } else {
                throw new Error('No download method available');
            }
            
            // Update attachment record
            attachment.localPath = localPath;
            attachment.downloadedAt = new Date();
            attachment.downloadStatus = 'completed';
            
            // Get actual file size
            const stats = await fs.stat(localPath);
            attachment.fileSize = stats.size;
            attachment.size = stats.size;
            
            // Process media-specific metadata
            await this.processMediaMetadata(attachment, localPath);
            
            console.log(`✅ Downloaded: ${fileName} (${attachment.fileSize} bytes)`);
            
        } catch (error) {
            console.error(`Failed to download attachment:`, error);
            attachment.downloadStatus = 'failed';
            attachment.downloadError = error.message;
        }
    }

    // Process media-specific metadata (dimensions, duration, etc.)
    async processMediaMetadata(attachment, localPath) {
        try {
            if (attachment.isImage) {
                const metadata = await sharp(localPath).metadata();
                attachment.dimensions = {
                    width: metadata.width,
                    height: metadata.height
                };
                
                // Create thumbnail
                await this.createImageThumbnail(attachment, localPath);
                
            } else if (attachment.isVideo || attachment.isAudio) {
                const metadata = await ffprobe(localPath, { path: ffprobeStatic.path });
                
                if (metadata.streams && metadata.streams.length > 0) {
                    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                    
                    if (videoStream) {
                        attachment.dimensions = {
                            width: videoStream.width,
                            height: videoStream.height
                        };
                    }
                    
                    // Duration from any stream
                    const stream = videoStream || audioStream || metadata.streams[0];
                    if (stream.duration) {
                        attachment.duration = parseFloat(stream.duration);
                    }
                }
                
                // Create video thumbnail
                if (attachment.isVideo) {
                    await this.createVideoThumbnail(attachment, localPath);
                }
            }
            
        } catch (error) {
            console.error('Failed to process media metadata:', error);
            // Don't throw - this is not critical
        }
    }

    // Create thumbnail for images
    async createImageThumbnail(attachment, localPath) {
        try {
            const thumbnailName = `thumb_${path.basename(localPath, path.extname(localPath))}.jpg`;
            const thumbnailPath = path.join(this.thumbnailDirectory, thumbnailName);
            
            await sharp(localPath)
                .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(thumbnailPath);
                
            attachment.thumbnailUrl = `/media/thumbnails/${thumbnailName}`;
            
        } catch (error) {
            console.error('Failed to create image thumbnail:', error);
        }
    }

    // Create thumbnail for videos
    async createVideoThumbnail(attachment, localPath) {
        try {
            const ffmpeg = require('fluent-ffmpeg');
            const thumbnailName = `thumb_${path.basename(localPath, path.extname(localPath))}.jpg`;
            const thumbnailPath = path.join(this.thumbnailDirectory, thumbnailName);
            
            return new Promise((resolve, reject) => {
                ffmpeg(localPath)
                    .screenshots({
                        count: 1,
                        folder: this.thumbnailDirectory,
                        filename: thumbnailName,
                        size: '300x300'
                    })
                    .on('end', () => {
                        attachment.thumbnailUrl = `/media/thumbnails/${thumbnailName}`;
                        resolve();
                    })
                    .on('error', reject);
            });
            
        } catch (error) {
            console.error('Failed to create video thumbnail:', error);
        }
    }

    // Utility: Sanitize file names
    sanitizeFileName(fileName) {
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid characters
            .replace(/\s+/g, '_')          // Replace spaces with underscores
            .substring(0, 100);            // Limit length
    }

    // Utility: Get file extension from MIME type
    getExtensionFromMimeType(mimeType) {
        const mimeToExt = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'audio/mp3': '.mp3',
            'audio/wav': '.wav',
            'application/pdf': '.pdf',
            'text/plain': '.txt'
        };
        
        return mimeToExt[mimeType] || '';
    }

    // PROVEN: Download attachment using working Google Chat attachment downloader method
    async downloadFromGoogleChatDirect(attachment, auth) {
        try {
            console.log(`    🔗 Using PROVEN Google Chat download method for: ${attachment.filename}`);
            
            // DEBUG: Log attachment structure
            console.log(`    🔍 DEBUG attachment structure:`);
            console.log(`       downloadUri: ${attachment.downloadUri ? 'YES' : 'NO'}`);
            console.log(`       thumbnailUri: ${attachment.thumbnailUri ? 'YES' : 'NO'}`);
            console.log(`       source: ${attachment.source ? JSON.stringify(attachment.source) : 'NO'}`);
            console.log(`       attachmentDataRef: ${attachment.attachmentDataRef ? JSON.stringify(attachment.attachmentDataRef) : 'NO'}`);
            console.log(`       name: ${attachment.name}`);
            
            // Get proper access token
            const accessTokenResponse = await auth.getAccessToken();
            const accessToken = accessTokenResponse.token || accessTokenResponse;
            
            if (!accessToken) {
                console.log(`    ❌ Failed to get access token`);
                return null;
            }
            
            // Generate filename
            const timestamp = Date.now();
            const safeFileName = `${timestamp}_${this.sanitizeFileName(attachment.filename)}`;
            const localPath = path.join(this.mediaDirectory, safeFileName);
            
            let downloadSuccess = false;
            let fileSize = 0;
            
            // Method 1: Try direct downloadUri if available
            if (attachment.downloadUri) {
                try {
                    console.log(`    → Trying direct downloadUri...`);
                    fileSize = await this.downloadWithAuthStream(attachment.downloadUri, localPath, accessToken);
                    downloadSuccess = true;
                    console.log(`    ✅ Direct downloadUri successful: ${fileSize} bytes`);
                } catch (error) {
                    console.log(`    ❌ Direct downloadUri failed: ${error.message}`);
                }
            }
            
            // Method 2: Try thumbnailUri if downloadUri failed
            if (!downloadSuccess && attachment.thumbnailUri) {
                try {
                    console.log(`    → Trying thumbnailUri...`);
                    fileSize = await this.downloadWithAuthStream(attachment.thumbnailUri, localPath, accessToken);
                    downloadSuccess = true;
                    console.log(`    ✅ ThumbnailUri successful: ${fileSize} bytes`);
                } catch (error) {
                    console.log(`    ❌ ThumbnailUri failed: ${error.message}`);
                }
            }
            
            // Method 3: Construct URLs using attachment token (PROVEN method)
            if (!downloadSuccess && attachment.source?.attachmentToken) {
                const attachmentToken = attachment.source.attachmentToken;
                const contentType = attachment.contentType || 'application/octet-stream';
                
                const constructedUrls = [
                    // Method from working downloader
                    `https://chat.google.com/api/get_attachment_url?url_type=DOWNLOAD_URL&content_type=${encodeURIComponent(contentType)}&attachment_token=${encodeURIComponent(attachmentToken)}`,
                    `https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=${encodeURIComponent(contentType)}&attachment_token=${encodeURIComponent(attachmentToken)}&sz=s0`,
                    `https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=${encodeURIComponent(contentType)}&attachment_token=${encodeURIComponent(attachmentToken)}&sz=w2048`,
                    `https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=${encodeURIComponent(contentType)}&attachment_token=${encodeURIComponent(attachmentToken)}`
                ];
                
                for (const constructedUrl of constructedUrls) {
                    try {
                        console.log(`    → Trying constructed URL...`);
                        fileSize = await this.downloadWithAuthStream(constructedUrl, localPath, accessToken);
                        downloadSuccess = true;
                        console.log(`    ✅ Constructed URL successful: ${fileSize} bytes`);
                        break;
                    } catch (error) {
                        console.log(`    ❌ Constructed URL failed: ${error.message}`);
                    }
                }
            }
            
            if (downloadSuccess && fileSize > 0) {
                // Verify the file is not an HTML error page (CRITICAL validation)
                let fileContent = '';
                try {
                    const fileData = await fs.readFile(localPath, 'utf8');
                    fileContent = fileData.substring(0, 200);
                } catch (e) {
                    // File might be binary, which is fine
                    fileContent = '';
                }
                
                if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE') || fileContent.includes('error')) {
                    console.log(`    ❌ Downloaded file is HTML error page, deleting...`);
                    console.log(`    Content preview: ${fileContent.substring(0, 100)}`);
                    await fs.unlink(localPath).catch(() => {});
                    return null;
                }
                
                console.log(`    ✅ Successfully downloaded real media file: ${safeFileName}`);
                
                return {
                    localPath: `/media/${safeFileName}`,
                    fileSize: fileSize
                };
            } else {
                console.log(`    ❌ All Google Chat download methods failed`);
                return null;
            }
            
        } catch (error) {
            console.log(`    ❌ Google Chat download error: ${error.message}`);
            return null;
        }
    }
    
    // PROVEN: Download with authentication using file stream (from working downloader)
    async downloadWithAuthStream(url, filePath, accessToken) {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const isHttps = urlObj.protocol === 'https:';
                const httpModule = isHttps ? https : http;
                
                const requestOptions = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'identity', // Don't use compression for binary files
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    }
                };
                
                const request = httpModule.request(requestOptions, (response) => {
                    if (response.statusCode === 200) {
                        const fileStream = require('fs').createWriteStream(filePath);
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
                            require('fs').unlink(filePath, () => {}); // Delete incomplete file
                            reject(err);
                        });
                        
                    } else if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        this.downloadWithAuthStream(redirectUrl, filePath, accessToken).then(resolve).catch(reject);
                    } else {
                        let errorBody = '';
                        response.on('data', chunk => errorBody += chunk);
                        response.on('end', () => {
                            reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 200)}`));
                        });
                    }
                });
                
                request.on('error', (err) => {
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
    
    // Proven working download method (from media proxy server)
    downloadFromUrlWithRedirects(url, options = {}) {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const isHttps = urlObj.protocol === 'https:';
                const httpModule = isHttps ? https : http;

                const requestOptions = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        ...options.headers
                    }
                };

                const request = httpModule.request(requestOptions, (response) => {
                    console.log(`    Response status: ${response.statusCode}`);

                    if (response.statusCode === 200) {
                        const chunks = [];
                        let totalLength = 0;

                        response.on('data', (chunk) => {
                            chunks.push(chunk);
                            totalLength += chunk.length;
                        });

                        response.on('end', () => {
                            const buffer = Buffer.concat(chunks, totalLength);
                            console.log(`    Downloaded ${totalLength} bytes`);
                            resolve(buffer);
                        });

                    } else if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            console.log(`    Following redirect to: ${redirectUrl.substring(0, 100)}...`);
                            this.downloadFromUrlWithRedirects(redirectUrl, options).then(resolve).catch(reject);
                        } else {
                            reject(new Error('Redirect without location'));
                        }
                    } else {
                        let errorBody = '';
                        response.on('data', chunk => errorBody += chunk);
                        response.on('end', () => {
                            reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 200)}`));
                        });
                    }
                });

                request.on('error', (error) => {
                    reject(error);
                });

                request.setTimeout(30000, () => {
                    request.abort();
                    reject(new Error('Request timeout'));
                });

                request.end();

            } catch (error) {
                reject(error);
            }
        });
    }
    
    // PROVEN working download method with proper authentication
    downloadWithProperAuth(url, accessToken) {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const isHttps = urlObj.protocol === 'https:';
                const httpModule = isHttps ? https : http;

                const requestOptions = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'User-Agent': 'Google-Apps-Script',
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity', // Don't use compression for binary files
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    }
                };

                console.log(`    Making authenticated request to: ${urlObj.hostname}${urlObj.pathname}`);
                
                const request = httpModule.request(requestOptions, (response) => {
                    console.log(`    Response status: ${response.statusCode}`);

                    if (response.statusCode === 200) {
                        const chunks = [];
                        let totalLength = 0;

                        response.on('data', (chunk) => {
                            chunks.push(chunk);
                            totalLength += chunk.length;
                        });

                        response.on('end', () => {
                            const buffer = Buffer.concat(chunks, totalLength);
                            console.log(`    Downloaded ${totalLength} bytes`);
                            resolve(buffer);
                        });

                    } else if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            console.log(`    Following redirect to: ${redirectUrl.substring(0, 100)}...`);
                            this.downloadWithProperAuth(redirectUrl, accessToken).then(resolve).catch(reject);
                        } else {
                            reject(new Error('Redirect without location'));
                        }
                    } else {
                        let errorBody = '';
                        response.on('data', chunk => errorBody += chunk);
                        response.on('end', () => {
                            console.log(`    Error response: ${errorBody.substring(0, 300)}`);
                            reject(new Error(`HTTP ${response.statusCode}: ${errorBody.substring(0, 200)}`));
                        });
                    }
                });

                request.on('error', (error) => {
                    console.log(`    Request error: ${error.message}`);
                    reject(error);
                });

                request.setTimeout(120000, () => {
                    request.abort();
                    reject(new Error('Download timeout (2 minutes)'));
                });

                request.end();

            } catch (error) {
                reject(error);
            }
        });
    }
    
    // ENHANCED: Download attachment via Chat API media download (prioritized method)
    async downloadFromChatAPI(attachment, auth) {
        try {
            if (!attachment.attachmentDataRef?.resourceName) {
                console.log(`    ❌ No Chat API resource name for ${attachment.filename}`);
                return null;
            }
            
            console.log(`    📱 Using Chat API media download with resourceName: ${attachment.attachmentDataRef.resourceName}`);
            
            const chat = google.chat({ version: 'v1', auth });
            
            console.log(`    → Calling chat.media.download with alt=media...`);
            const attachmentRes = await chat.media.download({
                resourceName: attachment.attachmentDataRef.resourceName,
                alt: 'media'  // CRITICAL: Required for binary media download
            });
            
            console.log(`    → Response received, checking data...`);
            console.log(`    → Response status: ${attachmentRes.status}`);
            console.log(`    → Response headers:`, Object.keys(attachmentRes.headers || {}));
            console.log(`    → Data type:`, typeof attachmentRes.data);
            console.log(`    → Data constructor:`, attachmentRes.data ? attachmentRes.data.constructor.name : 'N/A');
            console.log(`    → Data keys:`, attachmentRes.data ? Object.keys(attachmentRes.data) : 'N/A');
            
            // Google Chat API might return data in different formats
            let binaryData = null;
            
            if (attachmentRes.data) {
                // Try different ways to access the binary data
                if (Buffer.isBuffer(attachmentRes.data)) {
                    binaryData = attachmentRes.data;
                    console.log(`    → Found Buffer data: ${binaryData.length} bytes`);
                } else if (typeof attachmentRes.data === 'string') {
                    // Base64 encoded data
                    binaryData = Buffer.from(attachmentRes.data, 'base64');
                    console.log(`    → Found base64 string, decoded to: ${binaryData.length} bytes`);
                } else if (attachmentRes.data.constructor.name === 'Blob') {
                    // Handle Blob objects from Google Chat API
                    console.log(`    → Found Blob object, extracting binary data...`);
                    try {
                        // For Node.js Blob objects, we can use arrayBuffer() or stream()
                        if (typeof attachmentRes.data.arrayBuffer === 'function') {
                            const arrayBuffer = await attachmentRes.data.arrayBuffer();
                            binaryData = Buffer.from(arrayBuffer);
                            console.log(`    → Extracted ${binaryData.length} bytes from Blob`);
                        } else if (typeof attachmentRes.data.stream === 'function') {
                            // Alternative: read stream
                            const stream = attachmentRes.data.stream();
                            const chunks = [];
                            const reader = stream.getReader();
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                chunks.push(value);
                            }
                            binaryData = Buffer.concat(chunks);
                            console.log(`    → Extracted ${binaryData.length} bytes from Blob stream`);
                        } else {
                            // Fallback: try to access internal data
                            console.log(`    → Blob object has no standard methods, trying internal access...`);
                            if (attachmentRes.data._buffer) {
                                binaryData = Buffer.from(attachmentRes.data._buffer);
                                console.log(`    → Found _buffer property: ${binaryData.length} bytes`);
                            } else if (attachmentRes.data.data) {
                                binaryData = Buffer.from(attachmentRes.data.data);
                                console.log(`    → Found data property: ${binaryData.length} bytes`);
                            }
                        }
                    } catch (blobError) {
                        console.log(`    → Error extracting Blob data: ${blobError.message}`);
                    }
                } else if (attachmentRes.data.data) {
                    // Data might be nested in a .data property
                    if (Buffer.isBuffer(attachmentRes.data.data)) {
                        binaryData = attachmentRes.data.data;
                        console.log(`    → Found Buffer in nested data: ${binaryData.length} bytes`);
                    } else if (typeof attachmentRes.data.data === 'string') {
                        binaryData = Buffer.from(attachmentRes.data.data, 'base64');
                        console.log(`    → Found base64 string in nested data, decoded to: ${binaryData.length} bytes`);
                    }
                } else if (attachmentRes.data.body) {
                    // Some APIs return body property
                    binaryData = Buffer.from(attachmentRes.data.body, 'base64');
                    console.log(`    → Found base64 in body property, decoded to: ${binaryData.length} bytes`);
                } else {
                    console.log(`    → Trying to convert object to buffer directly...`);
                    try {
                        binaryData = Buffer.from(JSON.stringify(attachmentRes.data));
                        console.log(`    → Converted object to buffer: ${binaryData.length} bytes`);
                    } catch (e) {
                        console.log(`    → Failed to convert object: ${e.message}`);
                    }
                }
            }
            
            if (binaryData && binaryData.length > 0) {
                // Save to media directory
                const fileName = this.sanitizeFileName(attachment.filename);
                const timestamp = Date.now();
                const safeFileName = `${timestamp}_${fileName}`;
                const localPath = path.join(this.mediaDirectory, safeFileName);
                
                console.log(`    → Writing ${binaryData.length} bytes to ${safeFileName}`);
                await fs.writeFile(localPath, binaryData);
                
                // Get file size
                const stats = await fs.stat(localPath);
                
                console.log(`    ✅ Successfully downloaded ${stats.size} bytes via Chat API`);
                
                return {
                    localPath: `/media/${safeFileName}`,
                    fileSize: stats.size
                };
            } else {
                console.log(`    ❌ No data received from Chat API response`);
                return null;
            }
            
        } catch (error) {
            console.log(`    ❌ Chat API download error:`);
            console.log(`       Error message: ${error.message}`);
            console.log(`       Error code: ${error.code}`);
            console.log(`       Error status: ${error.status}`);
            if (error.response) {
                console.log(`       Response status: ${error.response.status}`);
                console.log(`       Response data:`, error.response.data ? JSON.stringify(error.response.data).substring(0, 200) : 'N/A');
            }
            return null;
        }
    }
    
    // Download attachment via Gmail API search (integrated from our working Gmail downloader)
    async downloadAttachmentViaGmail(attachment, auth) {
        try {
            console.log(`  🔍 Searching Gmail for: ${attachment.filename}`);
            
            const gmail = google.gmail({ version: 'v1', auth });
            
            // Try multiple search strategies (from our working downloader)
            const searchStrategies = [
                `has:attachment filename:"${attachment.filename}"`,
                `has:attachment filename:"${attachment.filename.split('.')[0]}"`,
                `has:attachment filename:${attachment.filename.split('.').pop()}`,
                `has:attachment newer_than:30d`
            ];
            
            let found = false;
            let searchResponse = null;
            
            for (const searchQuery of searchStrategies) {
                try {
                    searchResponse = await gmail.users.messages.list({
                        userId: 'me',
                        q: searchQuery,
                        maxResults: 10
                    });
                    
                    if (searchResponse.data.messages && searchResponse.data.messages.length > 0) {
                        console.log(`    📧 Found ${searchResponse.data.messages.length} Gmail messages`);
                        found = true;
                        break;
                    }
                } catch (error) {
                    console.log(`    ⚠️ Search error: ${error.message}`);
                }
            }
            
            if (!found || !searchResponse.data.messages) {
                console.log(`    ❌ No Gmail messages found for ${attachment.filename}`);
                return null;
            }
            
            // Try each message until we find the attachment
            for (const msgRef of searchResponse.data.messages) {
                try {
                    const message = await gmail.users.messages.get({
                        userId: 'me',
                        id: msgRef.id,
                        format: 'full'
                    });
                    
                    // Extract attachments from Gmail message
                    const attachments = this.extractGmailAttachments(message.data.payload);
                    
                    // Find matching attachment
                    let targetAttachment = attachments.find(att => 
                        att.filename === attachment.filename
                    );
                    
                    // If no exact match, try partial match
                    if (!targetAttachment) {
                        const baseName = attachment.filename.split('.')[0];
                        targetAttachment = attachments.find(att => 
                            att.filename.includes(baseName) || baseName.includes(att.filename.split('.')[0])
                        );
                    }
                    
                    if (targetAttachment && targetAttachment.body.attachmentId) {
                        console.log(`    📎 Found attachment in Gmail message ${msgRef.id}`);
                        
                        // Download the attachment
                        const attachmentData = await gmail.users.messages.attachments.get({
                            userId: 'me',
                            messageId: msgRef.id,
                            id: targetAttachment.body.attachmentId
                        });
                        
                        if (attachmentData.data.data) {
                            const buffer = Buffer.from(attachmentData.data.data, 'base64');
                            
                            // Save to media directory
                            const fileName = this.sanitizeFileName(attachment.filename);
                            const localPath = path.join(this.mediaDirectory, fileName);
                            
                            await fs.writeFile(localPath, buffer);
                            
                            return {
                                localPath: `/media/${fileName}`,
                                fileSize: buffer.length
                            };
                        }
                    }
                } catch (error) {
                    console.log(`    ⚠️ Error checking message ${msgRef.id}: ${error.message}`);
                }
            }
            
            console.log(`    ❌ Could not download ${attachment.filename} from Gmail`);
            return null;
            
        } catch (error) {
            console.error(`  ❌ Gmail download error for ${attachment.filename}:`, error.message);
            return null;
        }
    }
    
    // Helper function to extract attachments from Gmail message payload
    extractGmailAttachments(payload, attachments = []) {
        if (!payload) return attachments;

        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.filename && part.filename.length > 0) {
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        body: part.body,
                    });
                }
                if (part.parts) {
                    this.extractGmailAttachments(part, attachments);
                }
            }
        }

        return attachments;
    }

    // Get media statistics
    async getMediaStatistics() {
        try {
            const mediaStats = await fs.readdir(this.mediaDirectory);
            const thumbnailStats = await fs.readdir(this.thumbnailDirectory);
            
            let totalSize = 0;
            const fileTypes = {};
            
            for (const file of mediaStats) {
                try {
                    const filePath = path.join(this.mediaDirectory, file);
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                    
                    const ext = path.extname(file).toLowerCase();
                    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
                } catch (error) {
                    // Skip files that can't be read
                }
            }
            
            return {
                totalFiles: mediaStats.length,
                totalThumbnails: thumbnailStats.length,
                totalSizeBytes: totalSize,
                totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
                fileTypeBreakdown: fileTypes
            };
            
        } catch (error) {
            console.error('Failed to get media statistics:', error);
            return {
                totalFiles: 0,
                totalThumbnails: 0,
                totalSizeBytes: 0,
                totalSizeMB: 0,
                fileTypeBreakdown: {}
            };
        }
    }
}

module.exports = new MediaProcessingService();
