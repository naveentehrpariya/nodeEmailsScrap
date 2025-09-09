// EMERGENCY: Chat URL fix middleware - only for chat endpoints
const chatUrlFix = (req, res, next) => {
    // Only apply to chat-related requests on production
    if (!req.originalUrl.includes('/chat') || !req.get('host')?.includes('cmcemail.logistikore.com')) {
        return next();
    }
    
    console.log('🚨 Chat URL Fix Middleware Active for:', req.originalUrl);
    
    // Intercept res.json for chat responses only
    const originalJson = res.json;
    res.json = function(data) {
        try {
            // Convert to string and fix ONLY chat media URLs
            const dataString = JSON.stringify(data);
            const fixedString = dataString.replace(
                /cmcemail\.logistikore\.com\/api\/media\/files\//g,
                'cmcemail.logistikore.com/api/api/media/files/'
            );
            
            if (dataString !== fixedString) {
                console.log('🚨 CHAT URLs FIXED! Changed /api/media/files/ to /api/api/media/files/');
            }
            
            const fixedData = JSON.parse(fixedString);
            return originalJson.call(this, fixedData);
        } catch (error) {
            console.error('Chat URL Fix Error:', error.message);
            return originalJson.call(this, data);
        }
    };
    
    next();
};

module.exports = chatUrlFix;
