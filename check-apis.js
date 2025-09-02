const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function checkAPIsEnabled() {
    console.log('🔍 Checking if required APIs are enabled...\n');
    
    try {
        // Create auth without subject (no user impersonation needed for this check)
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            ['https://www.googleapis.com/auth/cloud-platform.read-only']
        );
        
        const serviceUsage = google.serviceusage({ version: 'v1', auth });
        const projectId = keys.project_id;
        
        console.log(`📋 Checking APIs for project: ${projectId}\n`);
        
        const requiredAPIs = [
            'chat.googleapis.com',
            'admin.googleapis.com', 
            'drive.googleapis.com'
        ];
        
        for (const api of requiredAPIs) {
            try {
                const response = await serviceUsage.services.get({
                    name: `projects/${projectId}/services/${api}`
                });
                
                const state = response.data.state;
                const enabled = state === 'ENABLED';
                
                console.log(`${enabled ? '✅' : '❌'} ${api}: ${state}`);
                
                if (!enabled) {
                    console.log(`   → To enable: gcloud services enable ${api} --project=${projectId}`);
                }
                
            } catch (error) {
                if (error.status === 403) {
                    console.log(`❓ ${api}: Cannot check (permissions needed)`);
                } else {
                    console.log(`❌ ${api}: Error - ${error.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Failed to check APIs:', error.message);
        console.log('\n💡 Manual check instructions:');
        console.log('1. Go to https://console.cloud.google.com/apis/dashboard');
        console.log('2. Select your project: crossmilescarrier');
        console.log('3. Check if these APIs are enabled:');
        console.log('   - Google Chat API');
        console.log('   - Admin SDK API'); 
        console.log('   - Google Drive API');
    }
}

checkAPIsEnabled().catch(console.error);
