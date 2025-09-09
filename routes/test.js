const express = require('express');
const router = express.Router();
const path = require('path');

// Test endpoint to check URL generation
router.get('/url-test', (req, res) => {
    // Log incoming request info
    console.log('🔍 URL TEST - Headers:', {
        protocol: req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http',
        host: req.get('host') || 'localhost',
        'x-forwarded-host': req.get('x-forwarded-host'),
        'x-forwarded-proto': req.get('x-forwarded-proto')
    });
    
    // Generate URLs exactly like our controllers would
    let chatBaseUrl, emailBaseUrl;
    
    // CHAT CONTROLLER LOGIC
    if (req.secure || req.get('x-forwarded-proto') === 'https' || req.get('host')?.includes('cmcemail.logistikore.com')) {
        chatBaseUrl = 'https://cmcemail.logistikore.com/api/api';
    } else {
        chatBaseUrl = 'http://localhost:5001';
    }
    
    // EMAIL CONTROLLER LOGIC
    if (req.secure || req.get('x-forwarded-proto') === 'https' || req.get('host')?.includes('cmcemail.logistikore.com')) {
        emailBaseUrl = 'https://cmcemail.logistikore.com/api/api';
    } else {
        emailBaseUrl = 'http://localhost:5001';
    }
    
    // Generate sample URLs
    const chatUrl = `${chatBaseUrl}/media/files/sample.pdf`;
    const emailUrl = `${emailBaseUrl}/media/email-attachments/sample.pdf`;
    
    // Return test results
    res.json({
        status: true,
        request: {
            protocol: req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http',
            host: req.get('host') || 'localhost',
            'x-forwarded-host': req.get('x-forwarded-host'),
            'x-forwarded-proto': req.get('x-forwarded-proto'),
            url: req.originalUrl
        },
        urls: {
            chatUrl,
            emailUrl
        },
        testing: {
            chatBaseUrl,
            emailBaseUrl
        },
        env: {
            APP_URL: process.env.APP_URL || 'not set',
            NODE_ENV: process.env.NODE_ENV || 'not set'
        }
    });
});

// Get direct controller source on production 
router.get('/controller-source', (req, res) => {
    try {
        // Try to get actual chat controller source
        const fs = require('fs');
        const controllerPath = path.join(__dirname, '../controllers/chatController.js');
        
        if (fs.existsSync(controllerPath)) {
            const source = fs.readFileSync(controllerPath, 'utf8');
            
            // Look for critical lines
            const lines = source.split('\n');
            const apiLineRegex = /baseUrl\s*=\s*['"]https:\/\/cmcemail\.logistikore\.com\/api(\/api)?['"]/;
            const apiLines = lines
                .map((line, index) => ({ line, index: index + 1 }))
                .filter(item => apiLineRegex.test(item.line));
            
            res.json({
                status: true,
                controller: 'chatController.js',
                exists: true,
                apiLineCount: apiLines.length,
                apiLines: apiLines,
                deploymentState: apiLines.some(item => item.line.includes('/api/api')) 
                    ? 'FIXED_DEPLOYED' 
                    : 'OLD_CODE_RUNNING'
            });
        } else {
            res.json({
                status: false,
                controller: 'chatController.js',
                exists: false,
                error: 'Controller file not found on production server'
            });
        }
    } catch (error) {
        res.json({
            status: false,
            controller: 'chatController.js',
            error: error.message
        });
    }
});

module.exports = router;
