const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Comprehensive production debugging
router.get('/production-debug', (req, res) => {
    console.log('🔍 FULL PRODUCTION DEBUG STARTING...');
    
    const debug = {
        timestamp: new Date().toISOString(),
        server: {
            uptime: process.uptime(),
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            cwd: process.cwd()
        },
        request: {
            protocol: req.secure ? 'https' : 'http',
            host: req.get('host'),
            'x-forwarded-proto': req.get('x-forwarded-proto'),
            'x-forwarded-host': req.get('x-forwarded-host'),
            originalUrl: req.originalUrl,
            baseUrl: req.baseUrl,
            url: req.url,
            method: req.method,
            headers: {
                host: req.get('host'),
                'user-agent': req.get('user-agent'),
                'x-forwarded-for': req.get('x-forwarded-for'),
                'x-forwarded-proto': req.get('x-forwarded-proto'),
                'x-forwarded-host': req.get('x-forwarded-host')
            }
        },
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            APP_URL: process.env.APP_URL || 'not set',
            PORT: process.env.PORT || 'not set'
        },
        files: {},
        modules: {},
        middlewareTest: {}
    };
    
    // Check if files exist
    const filesToCheck = [
        'controllers/chatController.js',
        'controllers/emailController.js', 
        'middleware/urlFix.js',
        'middleware/chatUrlFix.js',
        'routes/chat.js'
    ];
    
    filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, '..', file);
        try {
            const stats = fs.statSync(filePath);
            debug.files[file] = {
                exists: true,
                size: stats.size,
                modified: stats.mtime.toISOString()
            };
            
            // For controllers, check if they contain our fix
            if (file.includes('Controller.js')) {
                const content = fs.readFileSync(filePath, 'utf8');
                debug.files[file].hasApiApiFix = content.includes('api/api');
                debug.files[file].hasProductionDetection = content.includes('cmcemail.logistikore.com');
            }
        } catch (error) {
            debug.files[file] = {
                exists: false,
                error: error.message
            };
        }
    });
    
    // Test URL generation logic directly
    const testUrlGeneration = () => {
        let baseUrl;
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
        
        // Test the actual logic from our controller
        if (protocol === 'https' || host.includes('cmcemail.logistikore.com')) {
            baseUrl = 'https://cmcemail.logistikore.com/api/api';
        } else {
            baseUrl = 'http://localhost:5001';
        }
        
        return {
            protocol,
            host,
            detectedProduction: protocol === 'https' || host.includes('cmcemail.logistikore.com'),
            baseUrl,
            testChatUrl: `${baseUrl}/media/files/test.pdf`,
            testEmailUrl: `${baseUrl}/media/email-attachments/test.pdf`
        };
    };
    
    debug.urlTest = testUrlGeneration();
    
    // Test if middleware is loaded
    debug.middlewareTest = {
        urlFixExists: typeof require('../middleware/urlFix') === 'function',
        chatUrlFixExists: false
    };
    
    try {
        debug.middlewareTest.chatUrlFixExists = typeof require('../middleware/chatUrlFix') === 'function';
    } catch (e) {
        debug.middlewareTest.chatUrlFixError = e.message;
    }
    
    // Check if chat routes exist
    debug.chatRoutes = {
        chatRouteExists: false,
        chatRouteError: null
    };
    
    try {
        const chatRoute = require('../routes/chat');
        debug.chatRoutes.chatRouteExists = true;
        debug.chatRoutes.chatRouteType = typeof chatRoute;
    } catch (e) {
        debug.chatRoutes.chatRouteError = e.message;
    }
    
    // Memory usage
    debug.memory = process.memoryUsage();
    
    console.log('🔍 DEBUG COMPLETE - Check response for details');
    
    res.json({
        status: 'debug-complete',
        debug,
        analysis: {
            productionDetected: debug.urlTest.detectedProduction,
            correctUrlGeneration: debug.urlTest.baseUrl.includes('/api/api'),
            filesDeployed: Object.values(debug.files).every(f => f.exists),
            middlewareLoaded: debug.middlewareTest.urlFixExists,
            recommendation: getRecommendation(debug)
        }
    });
});

function getRecommendation(debug) {
    const issues = [];
    const solutions = [];
    
    if (!debug.urlTest.detectedProduction) {
        issues.push('Production environment not detected');
        solutions.push('Check x-forwarded-proto and host headers');
    }
    
    if (!debug.urlTest.baseUrl.includes('/api/api')) {
        issues.push('URL generation not using double /api');
        solutions.push('Controller logic not working correctly');
    }
    
    if (!Object.values(debug.files).every(f => f.exists)) {
        issues.push('Some files missing on production');
        solutions.push('Upload missing files and restart server');
    }
    
    if (!debug.middlewareTest.urlFixExists) {
        issues.push('URL fix middleware not loaded');
        solutions.push('Check middleware file path and restart server');
    }
    
    if (debug.chatRoutes.chatRouteError) {
        issues.push('Chat routes not working: ' + debug.chatRoutes.chatRouteError);
        solutions.push('Fix chat routes or upload missing dependencies');
    }
    
    return {
        issues,
        solutions,
        mainProblem: issues[0] || 'Unknown issue',
        nextStep: solutions[0] || 'Review debug output manually'
    };
}

module.exports = router;
