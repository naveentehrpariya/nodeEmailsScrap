const express = require('express');
const router = express.Router();

// Simple test route to verify chat controller deployment
router.get('/test-url-generation', (req, res) => {
    console.log('🧪 Testing UNIFIED URL generation on production');
    
    // NEW UNIFIED LOGIC - matches updated chatController
    let baseUrl;
    
    if (req) {
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
        
        console.log(`Protocol: ${protocol}, Host: ${host}`);
        
        // UNIFIED: Direct domain without /api suffix
        if (protocol === 'https' || host.includes('cmcemail.logistikore.com')) {
            baseUrl = 'https://cmcemail.logistikore.com';
            console.log(`🌐 [CHAT-TEST] Production URL: ${baseUrl}`);
        } else {
            // Local: Direct localhost without /api suffix
            baseUrl = 'http://localhost:5001';
            console.log(`🏠 [CHAT-TEST] Local URL: ${baseUrl}`);
        }
    }
    
    const testUrls = {
        chatMediaUrl: `${baseUrl}/media/files/test.pdf`,
        chatVideoUrl: `${baseUrl}/media/files/test.mov`,
        emailAttachmentUrl: `${baseUrl}/media/email-attachments/test.pdf`,
        timestamp: new Date().toISOString(),
        server: {
            protocol: req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http',
            host: req.get('host'),
            'x-forwarded-proto': req.get('x-forwarded-proto'),
            'x-forwarded-host': req.get('x-forwarded-host')
        }
    };
    
    res.json({
        status: 'success',
        message: 'UNIFIED Chat & Email URL generation test',
        urls: testUrls,
        expectedForProduction: '✅ URLs now use SINGLE /api/ for both chat and email (unified approach)'
    });
});

module.exports = router;
