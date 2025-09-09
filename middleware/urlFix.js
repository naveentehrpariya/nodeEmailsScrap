// EMERGENCY URL FIX - Simple middleware to fix chat media URLs
const urlFix = (req, res, next) => {
    // Only run on production domain
    if (!req.get('host')?.includes('cmcemail.logistikore.com')) {
        return next();
    }
    
    console.log('🚨 URL Fix Middleware Active for:', req.originalUrl);
    
    // Intercept res.json to fix URLs
    const originalJson = res.json;
    res.json = function(data) {
        try {
            // Convert to string and replace all instances
            const dataString = JSON.stringify(data);
            const fixedString = dataString.replace(
                /cmcemail\.logistikore\.com\/api\/media\//g,
                'cmcemail.logistikore.com/api/api/media/'
            );
            
            if (dataString !== fixedString) {
                console.log('🚨 URLs FIXED! Changed /api/media/ to /api/api/media/');
            }
            
            const fixedData = JSON.parse(fixedString);
            return originalJson.call(this, fixedData);
        } catch (error) {
            console.error('URL Fix Error:', error.message);
            return originalJson.call(this, data);
        }
    };
    
    next();
};

module.exports = urlFix;
