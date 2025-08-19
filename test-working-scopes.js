#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testWorkingScopes() {
    console.log('🧪 Testing known working scopes...');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    // Test Gmail API (known to work)
    try {
        console.log('✅ Testing Gmail API...');
        const gmailAuth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            ["https://www.googleapis.com/auth/gmail.readonly"],
            userEmail
        );

        const gmail = google.gmail({ version: "v1", auth: gmailAuth });
        const labelRes = await gmail.users.labels.list({ userId: 'me' });
        console.log(`✅ Gmail API working - found ${labelRes.data.labels?.length || 0} labels`);
        
    } catch (gmailError) {
        console.error('❌ Gmail API failed:', gmailError.message);
    }
    
    // Test individual Google Chat scopes
    const chatScopes = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly", 
        "https://www.googleapis.com/auth/drive.readonly"
    ];
    
    for (const scope of chatScopes) {
        try {
            console.log(`🔍 Testing scope: ${scope}...`);
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                [scope],
                userEmail
            );
            
            // Try to get access token
            await auth.authorize();
            console.log(`✅ Scope authorized: ${scope}`);
            
        } catch (error) {
            console.error(`❌ Scope failed: ${scope}`);
            console.error(`   Error: ${error.message}`);
        }
    }
    
    console.log('\n📋 Summary:');
    console.log('If Gmail works but Chat scopes fail, you need to:');
    console.log('1. Go to Google Workspace Admin Console');
    console.log('2. Navigate to Security > Access and data control > API Controls');
    console.log('3. Click "Manage Domain Wide Delegation"'); 
    console.log('4. Find your service account or add it');
    console.log('5. Add these OAuth scopes:');
    chatScopes.forEach(scope => console.log(`   - ${scope}`));
}

testWorkingScopes();
