const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const mediaProcessingService = require('../services/mediaProcessingService');
const router = express.Router();

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
        
        // Set appropriate content type
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
        
        const contentType = contentTypes[fileExtension] || 'application/octet-stream';
        
        res.set({
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Last-Modified': stats.mtime.toUTCString(),
            'Cache-Control': 'public, max-age=86400' // Cache for 1 day
        });
        
        // Stream the file
        const readStream = require('fs').createReadStream(filePath);
        readStream.pipe(res);
        
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

module.exports = router;
