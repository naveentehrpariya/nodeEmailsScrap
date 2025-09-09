const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const mediaProcessingService = require('../services/mediaProcessingService');
const Chat = require('../db/Chat');
const router = express.Router();

// Helper function to sanitize filename for HTTP headers
function sanitizeFilename(filename) {
    if (!filename) return 'attachment';
    
    // Remove or replace problematic characters that break HTTP headers
    return filename
        .replace(/["\\]/g, '') // Remove quotes and backslashes
        .replace(/[\r\n]/g, '') // Remove line breaks
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
        .replace(/[^\x20-\x7e]/g, '_') // Replace non-ASCII with underscore
        .trim() || 'attachment';
}

// Serve media files
router.get('/files/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const mediaDirectory = path.join(__dirname, '../media');
        const filePath = path.join(mediaDirectory, filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'Media file not found' });
        }
        
        // Get file stats for headers
        const stats = await fs.stat(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        // Function to detect MIME type by file magic number
        const detectMimeType = async (filePath, fileExtension) => {
            try {
                // Read first 12 bytes to check magic numbers
                const fs = require('fs');
                const fd = await fs.promises.open(filePath, 'r');
                const buffer = Buffer.alloc(12);
                await fd.read(buffer, 0, 12, 0);
                await fd.close();
                
                // Check magic numbers for common image formats
                const hex = buffer.toString('hex');
                
                // JPEG magic numbers
                if (hex.startsWith('ffd8ff')) {
                    return 'image/jpeg';
                }
                // PNG magic number
                if (hex.startsWith('89504e47')) {
                    return 'image/png';
                }
                // GIF magic numbers
                if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) {
                    return 'image/gif';
                }
                // WebP magic number
                if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') {
                    return 'image/webp';
                }
                // PDF magic number
                if (hex.startsWith('255044462d')) {
                    return 'application/pdf';
                }
            } catch (error) {
                console.log('MIME type detection failed, falling back to extension:', error.message);
            }
            
            // Fallback to extension-based detection
            const contentTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.zip': 'application/zip'
            };
            
            return contentTypes[fileExtension] || 'application/octet-stream';
        };
        
        const contentType = await detectMimeType(filePath, fileExtension);
        
        // Handle Range requests for video streaming
        const range = req.headers.range;
        if (range && contentType.startsWith('video/')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            
            res.set({
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400'
            });
            
            res.status(206);
            const readStream = require('fs').createReadStream(filePath, { start, end });
            readStream.pipe(res);
        } else {
            // Standard file serving
            const headers = {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Last-Modified': stats.mtime.toUTCString(),
                'Cache-Control': 'public, max-age=86400',
                'Accept-Ranges': 'bytes'
            };
            
            // For PDFs, suggest inline display
            if (contentType === 'application/pdf') {
                headers['Content-Disposition'] = 'inline';
            }
            
            // For downloads, set appropriate disposition
            if (req.query.download) {
                headers['Content-Disposition'] = `attachment; filename="${sanitizeFilename(req.query.download)}"`;
            }
            
            res.set(headers);
            
            // Stream the file
            const readStream = require('fs').createReadStream(filePath);
            readStream.pipe(res);
        }
        
    } catch (error) {
        console.error('Error serving media file:', error);
        res.status(500).json({ error: 'Failed to serve media file' });
    }
});

// Serve thumbnail files
router.get('/thumbnails/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const thumbnailDirectory = path.join(__dirname, '../media/thumbnails');
        const filePath = path.join(thumbnailDirectory, filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'Thumbnail not found' });
        }
        
        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400' // Cache for 1 day
        });
        
        // Stream the thumbnail
        const readStream = require('fs').createReadStream(filePath);
        readStream.pipe(res);
        
    } catch (error) {
        console.error('Error serving thumbnail:', error);
        res.status(500).json({ error: 'Failed to serve thumbnail' });
    }
});

// Get media statistics
router.get('/statistics', async (req, res) => {
    try {
        const stats = await mediaProcessingService.getMediaStatistics();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting media statistics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get media statistics' 
        });
    }
});

// Initialize media service (create directories)
router.post('/initialize', async (req, res) => {
    try {
        await mediaProcessingService.initialize();
        res.json({
            success: true,
            message: 'Media service initialized successfully'
        });
    } catch (error) {
        console.error('Error initializing media service:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to initialize media service' 
        });
    }
});

// Get media file info
router.get('/info/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const mediaDirectory = path.join(__dirname, '../media');
        const filePath = path.join(mediaDirectory, filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'Media file not found' });
        }
        
        const stats = await fs.stat(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        const fileInfo = {
            filename,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            extension: fileExtension,
            created: stats.birthtime,
            modified: stats.mtime,
            isImage: ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension),
            isVideo: ['.mp4', '.webm', '.avi', '.mov'].includes(fileExtension),
            isAudio: ['.mp3', '.wav', '.ogg', '.m4a'].includes(fileExtension),
            isDocument: ['.pdf', '.doc', '.docx', '.txt'].includes(fileExtension)
        };
        
        res.json({
            success: true,
            data: fileInfo
        });
        
    } catch (error) {
        console.error('Error getting file info:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get file information' 
        });
    }
});

// Preview document content for supported file types
router.get('/preview/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const mediaDirectory = path.join(__dirname, '../media');
        const filePath = path.join(mediaDirectory, filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const fileExtension = path.extname(filename).toLowerCase();
        const stats = await fs.stat(filePath);
        
        // Handle text files
        if (['.txt', '.md', '.json', '.csv', '.log'].includes(fileExtension)) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                res.json({
                    success: true,
                    filename,
                    type: 'text',
                    content,
                    size: stats.size,
                    extension: fileExtension
                });
            } catch (error) {
                res.status(500).json({ error: 'Failed to read text file' });
            }
            return;
        }
        
        // Handle CSV files with parsing
        if (fileExtension === '.csv') {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n').slice(0, 100); // Limit to first 100 rows
                const csvData = lines.map(line => line.split(','));
                
                res.json({
                    success: true,
                    filename,
                    type: 'csv',
                    data: csvData,
                    totalRows: content.split('\n').length,
                    previewRows: lines.length,
                    size: stats.size
                });
            } catch (error) {
                res.status(500).json({ error: 'Failed to parse CSV file' });
            }
            return;
        }
        
        // For other file types, return basic info
        res.json({
            success: true,
            filename,
            type: 'binary',
            message: 'Preview not available for this file type',
            extension: fileExtension,
            size: stats.size,
            previewSupported: false
        });
        
    } catch (error) {
        console.error('Error previewing file:', error);
        res.status(500).json({ error: 'Failed to preview file' });
    }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Serve employee monitoring sample media files
router.get('/monitoring/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const monitoringDirectory = path.join(__dirname, '../employee_monitoring/sample_media');
        const filePath = path.join(monitoringDirectory, filename);
        
        console.log(`👁️ Employee Monitoring: Serving ${filename}`);
        console.log(`   Path: ${filePath}`);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            console.log(`❌ Monitoring media not found: ${filename}`);
            return res.status(404).json({ error: 'Monitoring media file not found' });
        }
        
        // Get file stats for headers
        const stats = await fs.stat(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        // Set appropriate content type based on sample file type
        const contentTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.pdf': 'application/pdf',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        
        const contentType = contentTypes[fileExtension] || 'application/octet-stream';
        
        // Serve the actual binary file for proper display
        res.set({
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'public, max-age=86400',
            'X-Employee-Monitoring': 'active',
            'X-Sample-Media': 'true'
        });
        
        // Stream the binary file
        const readStream = require('fs').createReadStream(filePath);
        readStream.pipe(res);
        
    } catch (error) {
        console.error('❌ Error serving monitoring media:', error);
        res.status(500).json({ error: 'Failed to serve monitoring media' });
    }
});

// Gmail media proxy - serve Google Chat attachments by proxying their URLs
router.get('/gmail/media/:attachmentId', async (req, res) => {
    try {
        const attachmentId = req.params.attachmentId;
        console.log(`📧 Gmail Media Proxy: Serving attachment ${attachmentId}`);
        
        // Find the attachment in the database
        const chat = await Chat.findOne({
            'messages.attachments._id': attachmentId
        });
        
        if (!chat) {
            console.log(`❌ Attachment not found: ${attachmentId}`);
            return res.status(404).json({ error: 'Attachment not found' });
        }
        
        // Find the specific attachment
        let attachment = null;
        for (const message of chat.messages) {
            attachment = message.attachments.find(att => att._id.toString() === attachmentId);
            if (attachment) break;
        }
        
        if (!attachment) {
            console.log(`❌ Attachment not found in messages: ${attachmentId}`);
            return res.status(404).json({ error: 'Attachment not found in messages' });
        }
        
        console.log(`📡 Found attachment:`, {
            filename: attachment.filename || attachment.contentName,
            contentType: attachment.contentType || attachment.mimeType,
            downloadUrl: attachment.downloadUrl ? 'present' : 'missing',
            thumbnailUrl: attachment.thumbnailUrl ? 'present' : 'missing',
            localPath: attachment.localPath || 'none',
            downloadStatus: attachment.downloadStatus
        });
        
        // PRIORITY 1: If local file exists, serve it instead of proxying
        if (attachment.localPath) {
            const mediaDirectory = path.join(__dirname, '../media');
            const filename = attachment.localPath.split('/').pop();
            const filePath = path.join(mediaDirectory, filename);
            
            try {
                await fs.access(filePath);
                console.log(`📁 Serving local file: ${filename}`);
                
                // Redirect to local file route for consistency
                return res.redirect(`/api/media/files/${filename}`);
            } catch (error) {
                console.log(`⚠️ Local file not found, falling back to Google URL: ${filename}`);
            }
        }
        
        // PRIORITY 2: Try to serve by filename if download is completed
        if (attachment.downloadStatus === 'completed' && (attachment.filename || attachment.contentName)) {
            const filename = attachment.filename || attachment.contentName;
            const mediaDirectory = path.join(__dirname, '../media');
            const filePath = path.join(mediaDirectory, filename);
            
            try {
                await fs.access(filePath);
                console.log(`📁 Serving completed download by filename: ${filename}`);
                
                // Redirect to local file route for consistency
                return res.redirect(`/api/media/files/${filename}`);
            } catch (error) {
                console.log(`⚠️ Completed download file not found: ${filename}`);
            }
        }
        
        // PRIORITY 3: Google Chat URL proxy (with authentication issues)
        const googleUrl = attachment.downloadUrl || attachment.thumbnailUrl;
        if (!googleUrl) {
            console.log(`❌ No Google URL available for attachment: ${attachmentId}`);
            return res.status(404).json({ 
                error: 'No media URL available for this attachment',
                suggestion: 'Try running Gmail chat sync to download the media file locally'
            });
        }
        
        console.log(`🔄 Attempting to proxy Google URL (may fail due to auth): ${googleUrl.substring(0, 80)}...`);
        
        // For now, return an informative error since Google Chat URLs require authentication
        return res.status(503).json({
            error: 'Google Chat media proxy currently unavailable',
            reason: 'Google Chat URLs require authentication and may not be accessible via proxy',
            suggestion: 'Please run Gmail chat sync to download media files locally',
            attachmentInfo: {
                filename: attachment.filename || attachment.contentName,
                contentType: attachment.contentType || attachment.mimeType,
                downloadStatus: attachment.downloadStatus,
                hasLocalPath: !!attachment.localPath
            }
        });
        
    } catch (error) {
        console.error('❌ Error in Gmail media proxy:', error);
        res.status(500).json({ error: 'Failed to proxy Gmail media' });
    }
});

// Serve email attachment files from media directory (unified storage)
router.get('/email-attachments/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const mediaDirectory = path.join(__dirname, '../media');
        const filePath = path.join(mediaDirectory, filename);
        
        console.log(`📧 Email Attachment: Serving ${filename}`);
        console.log(`   Path: ${filePath}`);
        console.log(`   User-Agent: ${req.headers['user-agent']}`);
        console.log(`   Referer: ${req.headers.referer}`);
        console.log(`   Origin: ${req.headers.origin}`);
        console.log(`   Accept: ${req.headers.accept}`);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            console.log(`❌ Email attachment not found: ${filename}`);
            return res.status(404).json({ error: 'Email attachment not found' });
        }
        
        // Get file stats for headers
        const stats = await fs.stat(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        // Function to detect MIME type by file magic number
        const detectMimeType = async (filePath, fileExtension) => {
            try {
                // Read first 12 bytes to check magic numbers
                const fs = require('fs');
                const fd = await fs.promises.open(filePath, 'r');
                const buffer = Buffer.alloc(12);
                await fd.read(buffer, 0, 12, 0);
                await fd.close();
                
                // Check magic numbers for common image formats
                const hex = buffer.toString('hex');
                
                // JPEG magic numbers
                if (hex.startsWith('ffd8ff')) {
                    return 'image/jpeg';
                }
                // PNG magic number
                if (hex.startsWith('89504e47')) {
                    return 'image/png';
                }
                // GIF magic numbers
                if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) {
                    return 'image/gif';
                }
                // WebP magic number
                if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') {
                    return 'image/webp';
                }
                // PDF magic number
                if (hex.startsWith('255044462d')) {
                    return 'application/pdf';
                }
            } catch (error) {
                console.log('MIME type detection failed, falling back to extension:', error.message);
            }
            
            // Fallback to extension-based detection
            const contentTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.ppt': 'application/vnd.ms-powerpoint',
                '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                '.zip': 'application/zip',
                '.rar': 'application/x-rar-compressed'
            };
            
            return contentTypes[fileExtension] || 'application/octet-stream';
        };
        
        const contentType = await detectMimeType(filePath, fileExtension);
        
        // Handle Range requests for video streaming
        const range = req.headers.range;
        if (range && contentType.startsWith('video/')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            
            res.set({
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400'
            });
            
            res.status(206);
            const readStream = require('fs').createReadStream(filePath, { start, end });
            readStream.pipe(res);
        } else {
            // Standard file serving
            const headers = {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Last-Modified': stats.mtime.toUTCString(),
                'Cache-Control': 'public, max-age=86400',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            };
            
            // For PDFs, suggest inline display
            if (contentType === 'application/pdf') {
                headers['Content-Disposition'] = 'inline';
            }
            
            // For downloads, set appropriate disposition
            if (req.query.download) {
                headers['Content-Disposition'] = `attachment; filename="${sanitizeFilename(req.query.download)}"`;
            }
            
            res.set(headers);
            
            // Stream the file
            const readStream = require('fs').createReadStream(filePath);
            readStream.pipe(res);
        }
        
    } catch (error) {
        console.error('❌ Error serving email attachment:', error);
        res.status(500).json({ error: 'Failed to serve email attachment' });
    }
});

// Simple test page to verify image loading
router.get('/test/:filename', async (req, res) => {
    const filename = req.params.filename;
    const imageUrl = `/api/media/email-attachments/${filename}`;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Image Test: ${filename}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .test-container { max-width: 800px; margin: 0 auto; }
            .debug-info { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
            img { max-width: 100%; height: auto; border: 2px solid #ddd; margin: 10px 0; }
            .error { color: red; font-weight: bold; }
            .success { color: green; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="test-container">
            <h1>Image Loading Test</h1>
            <div class="debug-info">
                <strong>Filename:</strong> ${filename}<br>
                <strong>URL:</strong> <a href="${imageUrl}" target="_blank">${imageUrl}</a><br>
                <strong>Timestamp:</strong> ${new Date().toISOString()}
            </div>
            
            <h2>Direct Image Load:</h2>
            <img src="${imageUrl}" alt="${filename}" 
                 onload="document.getElementById('status').innerHTML='<span class=success>✅ Image loaded successfully!</span>'"
                 onerror="document.getElementById('status').innerHTML='<span class=error>❌ Failed to load image</span>'"
            />
            
            <div id="status">⏳ Loading image...</div>
            
            <h2>With Cache Busting:</h2>
            <img src="${imageUrl}?v=${Date.now()}" alt="${filename} (cache busted)" 
                 onload="document.getElementById('status2').innerHTML='<span class=success>✅ Cache-busted image loaded successfully!</span>'"
                 onerror="document.getElementById('status2').innerHTML='<span class=error>❌ Failed to load cache-busted image</span>'"
            />
            
            <div id="status2">⏳ Loading cache-busted image...</div>
        </div>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// Debug endpoint to check attachment structure
router.get('/debug/attachment/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const mediaDirectory = path.join(__dirname, '../media');
        
        // List all files in media directory (unified storage)
        const allFiles = await fs.readdir(mediaDirectory);
        const matchingFiles = allFiles.filter(file => file.includes(filename.replace(/\.[^.]+$/, '')));
        
        // Get file details
        const fileDetails = [];
        for (const file of matchingFiles) {
            try {
                const filePath = path.join(mediaDirectory, file);
                const stats = await fs.stat(filePath);
                fileDetails.push({
                    filename: file,
                    size: stats.size,
                    exists: true,
                    path: filePath
                });
            } catch (error) {
                fileDetails.push({
                    filename: file,
                    error: error.message,
                    exists: false
                });
            }
        }
        
        res.json({
            searchedFor: filename,
            allMatchingFiles: matchingFiles,
            fileDetails,
            totalFiles: allFiles.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
