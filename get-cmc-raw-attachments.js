const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function getCMCRawAttachments() {
    try {
        // Setup Google Chat API auth
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
            'naveendev@crossmilescarrier.com'
        );
        
        const chat = google.chat({ version: "v1", auth });
        
        // Fetch messages from CMC space
        console.log('Fetching messages from CMC space...');
        const messageRes = await chat.spaces.messages.list({
            parent: 'spaces/AAQAPUbCMD0', // CMC space ID
            pageSize: 100,
        });
        
        const messages = messageRes.data.messages || [];
        console.log(`Found ${messages.length} messages in CMC space`);
        
        // Find messages with attachments and get their full details
        for (const message of messages) {
            console.log(`\n=== Message: ${message.name} ===`);
            console.log(`Text: ${(message.text || '(no text)').substring(0, 50)}...`);
            
            // Get full message details
            const fullMessage = await chat.spaces.messages.get({
                name: message.name
            });
            
            const fullData = fullMessage.data;
            console.log(`Has attachments field: ${!!fullData.attachments}`);
            console.log(`Has attachment field: ${!!fullData.attachment}`);
            
            const attachments = fullData.attachments || fullData.attachment || [];
            console.log(`Total attachments: ${Array.isArray(attachments) ? attachments.length : (attachments ? 1 : 0)}`);
            
            if (attachments && attachments.length > 0) {
                attachments.forEach((att, i) => {
                    console.log(`\n  Attachment ${i + 1}:`);
                    console.log(`    Full object:`, JSON.stringify(att, null, 2));
                });
            } else if (attachments && !Array.isArray(attachments)) {
                // Single attachment object
                console.log(`\n  Single Attachment:`);
                console.log(`    Full object:`, JSON.stringify(attachments, null, 2));
            }
        }
        
    } catch (error) {
        console.error('Error fetching raw attachments:', error);
    }
}

// Run the function
getCMCRawAttachments();
