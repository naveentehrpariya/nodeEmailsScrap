const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testAuthentication() {
    console.log('🔍 Testing Google Workspace Authentication...\n');
    
    // Test user email
    const testUserEmail = 'naveendev@crossmilescarrier.com';
    
    // Define working scopes (matching index.js and fixed chatController.js)
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ];
    
    console.log('📋 Configuration:');
    console.log(`   Service Account: ${keys.client_email}`);
    console.log(`   Client ID: ${keys.client_id}`);
    console.log(`   Project ID: ${keys.project_id}`);
    console.log(`   Test User: ${testUserEmail}`);
    console.log(`   Scopes: ${SCOPES.length} scope(s)\n`);
    
    try {
        // Create JWT auth client
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            testUserEmail  // Subject (user to impersonate)
        );
        
        console.log('🔑 Creating JWT authentication...');
        
        // Test getting an access token
        const tokenInfo = await auth.authorize();
        console.log('✅ Successfully obtained access token!');
        console.log(`   Token type: ${tokenInfo.token_type || 'Bearer'}`);
        console.log(`   Expires: ${new Date(tokenInfo.expiry_date).toLocaleString()}\n`);
        
        // Test Google Chat API
        console.log('💬 Testing Google Chat API...');
        const chat = google.chat({ version: 'v1', auth });
        
        try {
            const spaces = await chat.spaces.list();
            console.log(`✅ Chat API working! Found ${spaces.data.spaces?.length || 0} spaces`);
        } catch (chatError) {
            console.log('❌ Chat API failed:', chatError.message);
        }
        
        // Test Admin Directory API
        console.log('👥 Testing Admin Directory API...');
        const admin = google.admin({ version: 'directory_v1', auth });
        
        try {
            const user = await admin.users.get({ userKey: testUserEmail });
            console.log(`✅ Admin API working! Found user: ${user.data.name?.fullName}`);
        } catch (adminError) {
            console.log('❌ Admin API failed:', adminError.message);
        }
        
    } catch (error) {
        console.log('❌ Authentication failed!');
        console.log(`   Error: ${error.message}\n`);
        
        if (error.message.includes('unauthorized_client')) {
            console.log('🔧 SOLUTION NEEDED:');
            console.log('   1. Enable Domain-wide Delegation for the service account');
            console.log('   2. Authorize the client ID in Google Admin Console');
            console.log(`   3. Use Client ID: ${keys.client_id}`);
            console.log('   4. Add these scopes in Admin Console:');
            SCOPES.forEach(scope => console.log(`      - ${scope}`));
        }
        
        if (error.message.includes('domain_not_verified')) {
            console.log('   - The domain needs to be verified in Google Cloud Console');
        }
        
        if (error.message.includes('access_denied')) {
            console.log('   - The service account may not have the required permissions');
        }
    }
}

// Run the test
testAuthentication().catch(console.error);
