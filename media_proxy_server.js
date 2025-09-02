const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Enable CORS for your frontend
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Add your frontend URLs
    credentials: true
}));

app.use(express.json());

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

// Connect to MongoDB
mongoose.connect(process.env.DB_URL_OFFICE)
    .then(() => console.log('✓ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Initialize Google Auth (if needed)
let googleAuth = null;
try {
    googleAuth = new google.auth.GoogleAuth({
        keyFile: './dispatch.json',
        scopes: [
            'https://www.googleapis.com/auth/chat.messages.readonly',
            'https://www.googleapis.com/auth/chat.spaces.readonly'
        ]
    });
} catch (authError) {
    console.log('⚠️  Google Auth initialization failed, will proceed without it');
}

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

// Helper function to download media with various methods
async function downloadMediaWithFallbacks(attachment) {
    const methods = [
        { name: 'downloadUrl', url: attachment.downloadUrl },
        { name: 'thumbnailUrl', url: attachment.thumbnailUrl }
    ];

    for (const method of methods) {
        if (!method.url) continue;

        try {
            console.log(`Trying ${method.name}...`);
            
            const mediaData = await downloadFromUrl(method.url);
            if (mediaData && mediaData.length > 0) {
                console.log(`✅ Success with ${method.name}`);
                return {
                    data: mediaData,
                    contentType: attachment.contentType || 'application/octet-stream'
                };
            }
        } catch (error) {
            console.log(`❌ ${method.name} failed:`, error.message);
        }
    }

    return null;
}

// Download function that tries various authentication methods
function downloadFromUrl(url, options = {}) {
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
                console.log(`Response status: ${response.statusCode}`);

                if (response.statusCode === 200) {
                    const chunks = [];
                    let totalLength = 0;

                    response.on('data', (chunk) => {
                        chunks.push(chunk);
                        totalLength += chunk.length;
                    });

                    response.on('end', () => {
                        const buffer = Buffer.concat(chunks, totalLength);
                        console.log(`Downloaded ${totalLength} bytes`);
                        resolve(buffer);
                    });

                } else if (response.statusCode === 302 || response.statusCode === 301) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        console.log(`Following redirect to: ${redirectUrl.substring(0, 100)}...`);
                        downloadFromUrl(redirectUrl, options).then(resolve).catch(reject);
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

// API endpoint to get media
app.get('/api/media/:chatId/:messageIndex/:attachmentIndex', async (req, res) => {
    try {
        const { chatId, messageIndex, attachmentIndex } = req.params;
        
        console.log(`📥 Media request: Chat ${chatId}, Message ${messageIndex}, Attachment ${attachmentIndex}`);
        
        // Find the chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Get the message
        const message = chat.messages[parseInt(messageIndex)];
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Get the attachment
        const attachment = message.attachments[parseInt(attachmentIndex)];
        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        console.log(`Found attachment: ${attachment.contentName}`);

        // Check if we have a local file first
        const fs = require('fs');
        const path = require('path');
        
        if (attachment.localPath) {
            const localFilePath = path.join(__dirname, 'media', attachment.localPath);
            if (fs.existsSync(localFilePath)) {
                console.log('✅ Serving from local file');
                const fileBuffer = fs.readFileSync(localFilePath);
                
                res.set({
                    'Content-Type': attachment.contentType || 'application/octet-stream',
                    'Content-Length': fileBuffer.length,
                    'Cache-Control': 'public, max-age=3600',
                    'Content-Disposition': `inline; filename="${sanitizeFilename(attachment.contentName || 'attachment')}"`
                });
                
                return res.send(fileBuffer);
            }
        }

        // Try to download from Google Chat URLs
        console.log('🌐 Attempting to download from Google Chat...');
        const mediaResult = await downloadMediaWithFallbacks(attachment);
        
        if (mediaResult) {
            console.log('✅ Downloaded from Google Chat');
            
            // Set appropriate headers
            res.set({
                'Content-Type': mediaResult.contentType,
                'Content-Length': mediaResult.data.length,
                'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
                'Content-Disposition': `inline; filename="${sanitizeFilename(attachment.contentName || 'attachment')}"`
            });
            
            return res.send(mediaResult.data);
        }

        // If all methods fail
        console.log('❌ All download methods failed');
        res.status(404).json({ error: 'Media not available' });

    } catch (error) {
        console.error('Media proxy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get attachment info
app.get('/api/attachment-info/:chatId/:messageIndex/:attachmentIndex', async (req, res) => {
    try {
        const { chatId, messageIndex, attachmentIndex } = req.params;
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const message = chat.messages[parseInt(messageIndex)];
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const attachment = message.attachments[parseInt(attachmentIndex)];
        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        res.json({
            contentName: attachment.contentName,
            contentType: attachment.contentType,
            fileSize: attachment.fileSize,
            hasLocalFile: !!attachment.localPath,
            hasDownloadUrl: !!attachment.downloadUrl,
            hasThumbnailUrl: !!attachment.thumbnailUrl
        });

    } catch (error) {
        console.error('Attachment info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Media proxy server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🖼️  Media endpoint: http://localhost:${PORT}/api/media/:chatId/:messageIndex/:attachmentIndex`);
});

module.exports = app;
