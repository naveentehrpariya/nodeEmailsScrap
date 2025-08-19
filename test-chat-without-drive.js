#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testChatWithoutDrive() {
    console.log('🧪 Testing Google Chat API without Drive scope...');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    try {
        // Setup Google Chat API without Drive scope
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/admin.directory.user.readonly"
            // Removed Drive scope that was failing
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
        
        console.log(`✅ Found ${spaces.length} spaces`);
        
        if (spaces.length === 0) {
            console.log('⚠️ No spaces found.');
            return;
        }
        
        // Test 2: Fetch messages from first space with messages
        let foundMessages = false;
        for (const space of spaces.slice(0, 3)) { // Test first 3 spaces
            console.log(`\n🔍 Testing space: ${space.displayName || '(Unnamed)'} (${space.name})`);
            
            try {
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 10,
                });

                const messages = messageRes.data.messages || [];
                console.log(`✅ Found ${messages.length} messages in this space`);
                
                if (messages.length > 0) {
                    foundMessages = true;
                    
                    messages.forEach((msg, index) => {
                        const hasAttachments = msg.attachments && msg.attachments.length > 0;
                        console.log(`  Message ${index + 1}: "${(msg.text || '(no text)').substring(0, 50)}..." - Attachments: ${hasAttachments ? msg.attachments.length : 0}`);
                        
                        if (hasAttachments) {
                            msg.attachments.forEach((att, attIndex) => {
                                console.log(`    📎 Attachment ${attIndex + 1}:`);
                                console.log(`      Name: ${att.name || 'N/A'}`);
                                console.log(`      Content Type: ${att.contentType || 'N/A'}`);
                                console.log(`      Has Drive Ref: ${!!att.driveDataRef}`);
                                console.log(`      Has Data Ref: ${!!att.attachmentDataRef}`);
                            });
                        }
                    });
                    
                    // Summary for this space
                    const totalAttachments = messages.reduce((total, msg) => 
                        total + (msg.attachments ? msg.attachments.length : 0), 0);
                    
                    if (totalAttachments > 0) {
                        console.log(`🎉 Found ${totalAttachments} attachments in this space!`);
                    }
                }
                
            } catch (messageError) {
                console.error(`❌ Failed to fetch messages from ${space.displayName}:`, messageError.message);
            }
        }
        
        if (!foundMessages) {
            console.log('\n⚠️ No messages found in any spaces.');
            console.log('   This might indicate:');
            console.log('   1. The spaces are empty');
            console.log('   2. Messages are older than the API returns by default');
            console.log('   3. Permission issues with accessing messages');
        }
        
    } catch (error) {
        console.error('❌ Google Chat API test failed:', error.message);
    }
}

testChatWithoutDrive();
