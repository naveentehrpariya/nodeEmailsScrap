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
    
    // Process attachments from Google Chat message (original method for compatibility)
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
