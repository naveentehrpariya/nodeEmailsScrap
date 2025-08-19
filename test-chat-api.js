#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testGoogleChatAPI() {
    console.log('🧪 Testing Google Chat API access...');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    try {
        // Setup Google Chat API
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/admin.directory.user.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            userEmail
        );

        const chat = google.chat({ version: "v1", auth });
        
        console.log(`📧 Testing with email: ${userEmail}`);
        
        // Test 1: List spaces
        console.log('📁 Fetching spaces...');
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        console.log(`✅ Found ${spaces.length} spaces:`);
        spaces.forEach((space, index) => {
            console.log(`  ${index + 1}. ${space.displayName || '(Unnamed)'} (${space.spaceType}) - ID: ${space.name}`);
        });
        
        if (spaces.length === 0) {
            console.log('⚠️ No spaces found. This might indicate permission issues.');
            return;
        }
        
        // Test 2: Fetch messages from first space
        const testSpace = spaces[0];
        console.log(`\n🔍 Testing message fetch from space: ${testSpace.displayName} (${testSpace.name})`);
        
        try {
            const messageRes = await chat.spaces.messages.list({
                parent: testSpace.name,
                pageSize: 5,
            });

            const messages = messageRes.data.messages || [];
            console.log(`✅ Found ${messages.length} messages in space`);
            
            messages.forEach((msg, index) => {
                const hasAttachments = msg.attachments && msg.attachments.length > 0;
                console.log(`  Message ${index + 1}:`);
                console.log(`    Text: "${(msg.text || '(no text)').substring(0, 100)}"`);
                console.log(`    Sender: ${msg.sender?.name || 'Unknown'}`);
                console.log(`    Attachments: ${hasAttachments ? msg.attachments.length : 0}`);
                
                if (hasAttachments) {
                    msg.attachments.forEach((att, attIndex) => {
                        console.log(`      📎 Attachment ${attIndex + 1}:`);
                        console.log(`        Name: ${att.name || 'N/A'}`);
                        console.log(`        Content Type: ${att.contentType || 'N/A'}`);
                        console.log(`        Content Name: ${att.contentName || 'N/A'}`);
                        console.log(`        Has Drive Ref: ${!!att.driveDataRef}`);
                        console.log(`        Has Data Ref: ${!!att.attachmentDataRef}`);
                        
                        if (att.driveDataRef) {
                            console.log(`        Drive File ID: ${att.driveDataRef.driveFileId}`);
                        }
                    });
                }
                console.log('');
            });
            
            // Summary
            const totalAttachments = messages.reduce((total, msg) => 
                total + (msg.attachments ? msg.attachments.length : 0), 0);
            
            console.log(`📊 Summary:`);
            console.log(`  - Total messages checked: ${messages.length}`);
            console.log(`  - Total attachments found: ${totalAttachments}`);
            
            if (totalAttachments === 0) {
                console.log('⚠️ No attachments found in recent messages.');
                console.log('   This explains why no media files are being processed.');
                console.log('   Try sending a test message with an image or file to Google Chat.');
            } else {
                console.log('🎉 Attachments found! Media processing should work.');
            }
            
        } catch (messageError) {
            console.error(`❌ Failed to fetch messages:`, messageError.message);
            console.log('   This indicates the Google Chat Messages API is not accessible.');
        }
        
    } catch (error) {
        console.error('❌ Google Chat API test failed:', error.message);
        
        if (error.message.includes('Not Authorized')) {
            console.log('\n🔧 Troubleshooting suggestions:');
            console.log('1. Ensure domain-wide delegation is set up for this service account');
            console.log('2. Check that the following scopes are authorized:');
            console.log('   - https://www.googleapis.com/auth/chat.spaces.readonly');
            console.log('   - https://www.googleapis.com/auth/chat.messages.readonly');
            console.log('   - https://www.googleapis.com/auth/admin.directory.user.readonly');
            console.log('   - https://www.googleapis.com/auth/drive.readonly');
            console.log('3. Verify the service account email has access to Google Chat');
        }
    }
}

testGoogleChatAPI();
