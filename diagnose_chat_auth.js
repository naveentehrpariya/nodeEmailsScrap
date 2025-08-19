const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function diagnoseGoogleChatAuth() {
    try {
        console.log('🔍 Diagnosing Google Chat API Authentication...\n');

        // Check if dispatch.json exists
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            console.log('❌ dispatch.json not found');
            return;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        console.log('✓ Service account file loaded');
        console.log(`   Client email: ${serviceAccount.client_email}`);
        console.log(`   Project ID: ${serviceAccount.project_id}`);

        // Method 1: Test with regular service account (no impersonation)
        console.log('\n📋 Testing Method 1: Regular Service Account');
        try {
            const auth1 = new google.auth.GoogleAuth({
                credentials: serviceAccount,
                scopes: [
                    'https://www.googleapis.com/auth/chat.messages.readonly',
                    'https://www.googleapis.com/auth/chat.spaces.readonly'
                ]
            });

            const authClient1 = await auth1.getClient();
            const token1 = await authClient1.getAccessToken();
            console.log('✓ Method 1: Got access token successfully');
            
            const chatApi1 = google.chat({ version: 'v1', auth: authClient1 });
            // Try to list spaces (this should work if auth is correct)
            const spaces = await chatApi1.spaces.list({});
            console.log(`✓ Method 1: Listed ${spaces.data.spaces?.length || 0} spaces`);
            
        } catch (error) {
            console.log(`❌ Method 1 failed: ${error.message}`);
        }

        // Method 2: Test with domain-wide delegation (impersonation)
        console.log('\n👤 Testing Method 2: Domain-wide Delegation');
        try {
            const auth2 = new google.auth.JWT({
                email: serviceAccount.client_email,
                key: serviceAccount.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/chat.messages.readonly',
                    'https://www.googleapis.com/auth/chat.spaces.readonly'
                ],
                subject: 'naveendev@crossmilescarrier.com'
            });

            const token2 = await auth2.getAccessToken();
            console.log('✓ Method 2: Got access token with impersonation');

            const chatApi2 = google.chat({ version: 'v1', auth: auth2 });
            const spaces2 = await chatApi2.spaces.list({});
            console.log(`✓ Method 2: Listed ${spaces2.data.spaces?.length || 0} spaces`);

        } catch (error) {
            console.log(`❌ Method 2 failed: ${error.message}`);
        }

        // Method 3: Test Gmail API (for comparison)
        console.log('\n📧 Testing Method 3: Gmail API (for comparison)');
        try {
            const gmailAuth = new google.auth.JWT(
                serviceAccount.client_email,
                null,
                serviceAccount.private_key,
                ['https://www.googleapis.com/auth/gmail.readonly'],
                'naveendev@crossmilescarrier.com'
            );

            const gmailApi = google.gmail({ version: 'v1', auth: gmailAuth });
            const profile = await gmailApi.users.getProfile({ userId: 'me' });
            console.log(`✓ Method 3: Gmail API works - ${profile.data.emailAddress}`);

        } catch (error) {
            console.log(`❌ Method 3 failed: ${error.message}`);
        }

        // Method 4: Check specific Chat API endpoints
        console.log('\n🔧 Testing Method 4: Specific Chat API Endpoints');
        try {
            const auth4 = new google.auth.JWT({
                email: serviceAccount.client_email,
                key: serviceAccount.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/chat.messages.readonly',
                    'https://www.googleapis.com/auth/chat.spaces.readonly',
                    'https://www.googleapis.com/auth/drive.readonly'
                ],
                subject: 'naveendev@crossmilescarrier.com'
            });

            const chatApi4 = google.chat({ version: 'v1', auth: auth4 });
            
            // List spaces
            const spaces4 = await chatApi4.spaces.list({});
            console.log(`✓ Method 4: Listed ${spaces4.data.spaces?.length || 0} spaces`);

            if (spaces4.data.spaces && spaces4.data.spaces.length > 0) {
                const spaceId = spaces4.data.spaces[0].name;
                console.log(`   Trying to list messages for space: ${spaceId}`);
                
                try {
                    const messages = await chatApi4.spaces.messages.list({
                        parent: spaceId
                    });
                    console.log(`   ✓ Listed ${messages.data.messages?.length || 0} messages`);
                } catch (msgError) {
                    console.log(`   ❌ Message listing failed: ${msgError.message}`);
                }
            }

        } catch (error) {
            console.log(`❌ Method 4 failed: ${error.message}`);
        }

        console.log('\n📝 RECOMMENDATIONS:');
        console.log('1. Verify Google Workspace admin has enabled Google Chat API');
        console.log('2. Check if service account has domain-wide delegation enabled');
        console.log('3. Ensure scopes are properly authorized in Google Admin Console');
        console.log('4. Media downloads might require additional permissions');
        console.log('\n💡 The issue might be that Google Chat media attachments');
        console.log('   require special handling or are stored in Google Drive');
        console.log('   with different access permissions.');

    } catch (error) {
        console.error('💥 Diagnostic error:', error);
    }
}

diagnoseGoogleChatAuth();
