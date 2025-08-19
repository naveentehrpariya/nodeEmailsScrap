#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testValidScopes() {
    console.log('🔍 Testing valid Google Chat API scopes for attachments...\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    // Test different valid scope combinations
    const scopeTests = [
        {
            name: "Standard Chat Scopes",
            scopes: [
                "https://www.googleapis.com/auth/chat.spaces.readonly",
                "https://www.googleapis.com/auth/chat.messages.readonly", 
                "https://www.googleapis.com/auth/admin.directory.user.readonly",
                "https://www.googleapis.com/auth/drive.readonly"
            ]
        },
        {
            name: "Chat Bot Scopes (for attachments)",
            scopes: [
                "https://www.googleapis.com/auth/chat.bot",
                "https://www.googleapis.com/auth/drive.readonly"
            ]
        },
        {
            name: "Full Chat Access",
            scopes: [
                "https://www.googleapis.com/auth/chat.messages",
                "https://www.googleapis.com/auth/chat.spaces",
                "https://www.googleapis.com/auth/drive.readonly"
            ]
        },
        {
            name: "Chat Import Scopes",
            scopes: [
                "https://www.googleapis.com/auth/chat.import",
                "https://www.googleapis.com/auth/drive.readonly"
            ]
        }
    ];

    for (const test of scopeTests) {
        console.log(`📋 Testing: ${test.name}`);
        console.log(`   Scopes: ${test.scopes.join(', ')}`);
        
        try {
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                test.scopes,
                userEmail
            );

            const chat = google.chat({ version: 'v1', auth });
            
            // Test basic API access
            const spaceRes = await chat.spaces.list({ pageSize: 1 });
            console.log(`   ✅ API Access: SUCCESS`);
            
            // Test message access
            if (spaceRes.data.spaces && spaceRes.data.spaces.length > 0) {
                const messageRes = await chat.spaces.messages.list({
                    parent: spaceRes.data.spaces[0].name,
                    pageSize: 1
                });
                
                console.log(`   ✅ Message Access: SUCCESS`);
                
                if (messageRes.data.messages && messageRes.data.messages.length > 0) {
                    const fullMsg = await chat.spaces.messages.get({
                        name: messageRes.data.messages[0].name
                    });
                    
                    console.log(`   📨 Message fields: ${Object.keys(fullMsg.data).join(', ')}`);
                    console.log(`   📎 Has attachments field: ${fullMsg.data.hasOwnProperty('attachments')}`);
                    console.log(`   📎 Attachments value: ${JSON.stringify(fullMsg.data.attachments)}`);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ FAILED: ${error.message}`);
            
            if (error.message.includes('unauthorized_client')) {
                console.log(`      → These scopes are not authorized in domain-wide delegation`);
            } else if (error.message.includes('invalid_scope')) {
                console.log(`      → One or more scopes are invalid`);
            }
        }
        
        console.log('');
    }
    
    console.log('🔍 ANALYZING ATTACHMENT ACCESS PATTERNS...\n');
    
    // Check Google's documentation patterns
    console.log('📚 According to Google Chat API documentation:');
    console.log('   • Attachments are part of message objects');  
    console.log('   • No special scope needed beyond chat.messages.readonly');
    console.log('   • Drive attachments need drive.readonly scope');
    console.log('   • Bot-posted attachments might need chat.bot scope');
    
    console.log('\n🔍 POSSIBLE REASONS FOR MISSING ATTACHMENTS:');
    console.log('   1. Messages genuinely have no attachments');
    console.log('   2. Attachments are in newer messages not yet synced');
    console.log('   3. Service account user impersonation issue');
    console.log('   4. Chat API version or endpoint limitation');
    console.log('   5. Domain security policies blocking attachment metadata');
    
    console.log('\n💡 DEBUGGING STRATEGY:');
    console.log('   1. Send a NEW message with attachment in Google Chat');
    console.log('   2. Wait 2-3 minutes for propagation'); 
    console.log('   3. Re-run attachment detection with current scopes');
    console.log('   4. Check if the NEW message shows up with attachments');
}

// Additional function to check what the API actually returns
async function debugMessageStructure() {
    console.log('\n🔬 DEBUGGING: Analyzing actual API response structure...\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    const CURRENT_SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly", 
        "https://www.googleapis.com/auth/drive.readonly"
    ];

    try {
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            CURRENT_SCOPES,
            userEmail
        );

        const chat = google.chat({ version: 'v1', auth });
        
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        if (spaces.length > 0) {
            const messageRes = await chat.spaces.messages.list({
                parent: spaces[0].name,
                pageSize: 3
            });
            
            const messages = messageRes.data.messages || [];
            
            if (messages.length > 0) {
                console.log('📨 Sample message structure from API:');
                
                const fullMsg = await chat.spaces.messages.get({
                    name: messages[0].name
                });
                
                console.log('Full message object keys:', Object.keys(fullMsg.data));
                console.log('');
                console.log('Complete message structure:');
                console.log(JSON.stringify(fullMsg.data, null, 2));
                
                // Check all messages in first space for any attachments
                console.log('\n🔍 Checking ALL messages for any attachment presence:');
                
                for (let i = 0; i < Math.min(messages.length, 10); i++) {
                    const msg = await chat.spaces.messages.get({ name: messages[i].name });
                    const text = (msg.data.text || '(no text)').substring(0, 50);
                    const hasAttachKey = msg.data.hasOwnProperty('attachments');
                    const attachValue = msg.data.attachments;
                    
                    console.log(`   Message ${i+1}: "${text}..." | Has attach key: ${hasAttachKey} | Value: ${JSON.stringify(attachValue)}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

testValidScopes().then(() => {
    return debugMessageStructure();
}).then(() => {
    console.log('\n✨ Scope testing completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Testing failed:', error);
    process.exit(1);
});
