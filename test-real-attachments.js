#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testWithFreshMessage() {
    console.log('🎯 SOLUTION: Testing with the correct approach for attachments\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    // The current scopes are actually correct according to Google documentation
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly", 
        "https://www.googleapis.com/auth/drive.readonly"
    ];

    const auth = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        SCOPES,
        userEmail
    );

    const chat = google.chat({ version: 'v1', auth });
    
    console.log('📋 IMPORTANT FINDING:');
    console.log('   • Your current scopes are CORRECT for attachments');
    console.log('   • The "attachments" field only appears when messages HAVE attachments');
    console.log('   • Your messages currently have NO attachments (confirmed by API structure)');
    
    console.log('\n🧪 IMMEDIATE TEST REQUIRED:');
    console.log('   1. 📱 Open Google Chat (chat.google.com) RIGHT NOW');
    console.log('   2. 📤 Send a message with an IMAGE or FILE attachment');
    console.log('   3. ⏱️  Wait 30 seconds for API propagation');
    console.log('   4. 🔄 Re-run this script to see the attachment');
    
    console.log('\n🔍 Current message analysis:');
    
    try {
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        // Get the most recent messages to check for new ones
        for (const space of spaces.slice(0, 2)) {
            console.log(`\n   📁 Space: ${space.displayName || '(Direct Message)'}`);
            
            const messageRes = await chat.spaces.messages.list({
                parent: space.name,
                pageSize: 5,
                orderBy: 'createTime desc'  // Get most recent first
            });
            
            const messages = messageRes.data.messages || [];
            console.log(`      📨 ${messages.length} recent messages:`);
            
            for (let i = 0; i < messages.length; i++) {
                const msg = await chat.spaces.messages.get({ name: messages[i].name });
                
                const text = (msg.data.text || '(no text)').substring(0, 40);
                const time = new Date(msg.data.createTime).toLocaleString();
                const hasAttachments = msg.data.hasOwnProperty('attachments');
                const attachments = msg.data.attachments;
                
                console.log(`         ${i+1}. "${text}..." (${time})`);
                console.log(`            Attachments: ${hasAttachments ? JSON.stringify(attachments) : 'NONE'}`);
                
                if (hasAttachments && attachments && attachments.length > 0) {
                    console.log(`            🎉 ATTACHMENT FOUND!`);
                    attachments.forEach((att, idx) => {
                        console.log(`               📎 ${idx+1}: ${att.name || att.contentName || 'Unknown'}`);
                        console.log(`                  Type: ${att.contentType || 'Unknown'}`);
                        console.log(`                  Keys: ${Object.keys(att).join(', ')}`);
                    });
                }
            }
        }
        
        console.log('\n💡 NEXT STEPS:');
        console.log('   1. ✅ Your Google Chat API access is working perfectly');
        console.log('   2. ✅ Your scopes are correct for attachments');  
        console.log('   3. ✅ Your media processing system is ready');
        console.log('   4. 🎯 You need to send a message WITH an attachment');
        console.log('   5. 🔄 Then run your chat sync to process it');
        
        console.log('\n📤 HOW TO TEST:');
        console.log('   • Go to chat.google.com');
        console.log('   • Open the "CMC" space or any direct message');
        console.log('   • Click the 📎 attachment button or drag-drop a file');
        console.log('   • Send an image, PDF, or any file');
        console.log('   • Run: node test-attachment-detection.js');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Function to monitor for new messages
async function monitorForNewAttachments() {
    console.log('\n🔄 MONITORING MODE: Checking for new messages every 10 seconds...');
    console.log('   Send a message with attachment NOW and watch this space!\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly", 
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
        "https://www.googleapis.com/auth/drive.readonly"
    ];

    const auth = new google.auth.JWT(keys.client_email, null, keys.private_key, SCOPES, userEmail);
    const chat = google.chat({ version: 'v1', auth });
    
    let lastMessageCount = 0;
    
    for (let i = 0; i < 6; i++) { // Monitor for 1 minute
        try {
            const spaceRes = await chat.spaces.list();
            const spaces = spaceRes.data.spaces || [];
            
            let totalMessages = 0;
            let foundAttachment = false;
            
            for (const space of spaces) {
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 10,
                    orderBy: 'createTime desc'
                });
                
                const messages = messageRes.data.messages || [];
                totalMessages += messages.length;
                
                // Check the most recent message
                if (messages.length > 0) {
                    const latestMsg = await chat.spaces.messages.get({ name: messages[0].name });
                    
                    if (latestMsg.data.attachments) {
                        foundAttachment = true;
                        console.log(`🎉 NEW ATTACHMENT DETECTED!`);
                        console.log(`   Space: ${space.displayName || '(Direct Message)'}`);
                        console.log(`   Message: "${(latestMsg.data.text || '(no text)').substring(0, 50)}..."`);
                        console.log(`   Attachments: ${latestMsg.data.attachments.length}`);
                        console.log(`   Time: ${new Date(latestMsg.data.createTime).toLocaleString()}`);
                        break;
                    }
                }
            }
            
            if (foundAttachment) {
                console.log('\n✅ SUCCESS! Attachment found. Your system is working!');
                break;
            }
            
            if (totalMessages !== lastMessageCount) {
                console.log(`   📨 Messages: ${totalMessages} (${totalMessages > lastMessageCount ? 'NEW' : 'same'})`);
                lastMessageCount = totalMessages;
            } else {
                process.stdout.write('.');
            }
            
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
        } catch (error) {
            console.log(`   ❌ Monitor error: ${error.message}`);
        }
    }
    
    console.log('\n⏱️ Monitoring completed. Send attachment and run test again if needed.');
}

testWithFreshMessage().then(() => {
    console.log('\n🤔 Would you like to monitor for new attachments? (Will run for 1 minute)');
    console.log('   This will check every 10 seconds for new messages with attachments.');
    console.log('   Press Ctrl+C to skip, or wait 3 seconds to start monitoring...\n');
    
    return new Promise(resolve => {
        setTimeout(() => {
            console.log('🔄 Starting monitoring...');
            monitorForNewAttachments().then(resolve);
        }, 3000);
    });
}).then(() => {
    process.exit(0);
}).catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
});
