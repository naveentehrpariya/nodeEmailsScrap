const express = require('express');
const router = express.Router();

// Test endpoint to diagnose production server state
router.get('/server-info', (req, res) => {
    console.log('🔍 DEBUG: Server info requested');
    
    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        server: {
            host: req.get('host'),
            protocol: req.secure ? 'https' : 'http',
            'x-forwarded-proto': req.get('x-forwarded-proto'),
            'x-forwarded-host': req.get('x-forwarded-host'),
            originalUrl: req.originalUrl,
            baseUrl: req.baseUrl,
            url: req.url
        },
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            APP_URL: process.env.APP_URL || 'not set'
        },
        test: {
            // Test URL generation like our controllers would
            testUrls: {
                chatUrl: 'https://cmcemail.logistikore.com/api/media/files/test.pdf',
                emailUrl: 'https://cmcemail.logistikore.com/api/media/email-attachments/test.pdf'
            }
        },
        message: 'If middleware is working, the URLs above should be automatically fixed to /api/api/'
    });
});

// Test URL fixing specifically
router.get('/test-url-fix', (req, res) => {
    console.log('🔍 DEBUG: Testing URL fix');
    
    // Create response with URLs that should be fixed
    const testResponse = {
        status: 'testing',
        urls: [
            'https://cmcemail.logistikore.com/api/media/files/video.mov',
            'https://cmcemail.logistikore.com/api/media/email-attachments/doc.pdf'
        ],
        nested: {
            attachment: {
                previewUrl: 'https://cmcemail.logistikore.com/api/media/files/image.jpg',
                downloadUrl: 'https://cmcemail.logistikore.com/api/media/files/image.jpg?download=image.jpg'
            }
        }
    };
    
    res.json(testResponse);
});

// Force restart test
router.get('/restart-test', (req, res) => {
    const startTime = process.uptime();
    res.json({
        status: 'server-running',
        uptime: `${Math.floor(startTime / 60)} minutes`,
        pid: process.pid,
        timestamp: new Date().toISOString(),
        message: 'If uptime is less than 5 minutes, server was recently restarted'
    });
});

module.exports = router;
