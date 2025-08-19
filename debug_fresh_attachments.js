const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeGoogleAPIs() {
    const serviceAccountPath = path.join(__dirname, 'dispatch.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
            'https://www.googleapis.com/auth/chat.messages.readonly',
            'https://www.googleapis.com/auth/chat.spaces.readonly',
        ],
        subject: 'naveendev@crossmilescarrier.com'
    });

    const chatApi = google.chat({ version: 'v1', auth });
    return { auth, chatApi };
}

async function debugFreshAttachments() {
    try {
        console.log('🔍 Debug: Inspecting fresh attachment structure...\n');
        
        const { auth, chatApi } = await initializeGoogleAPIs();
        
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Get CMC chat (first one with attachments)
        const cmcChat = await Chat.findOne({ displayName: 'CMC' });
        if (!cmcChat) {
            console.log('❌ CMC chat not found');
            return;
        }

        console.log(`📋 CMC Chat has ${cmcChat.messages.length} messages`);

        // Get first message with attachment
        const messageWithAttachment = cmcChat.messages.find(msg => 
            msg.attachments && msg.attachments.length > 0
        );

        if (!messageWithAttachment) {
            console.log('❌ No messages with attachments found');
            return;
        }

        const messageName = messageWithAttachment.messageId;
        const dbAttachment = messageWithAttachment.attachments[0];

        console.log(`\n📨 DB Message: ${messageName}`);
        console.log('📎 DB Attachment:');
        console.log('   Name:', dbAttachment.name);
        console.log('   Content Name:', dbAttachment.contentName);
        console.log('   Content Type:', dbAttachment.contentType);
        console.log('   Download URL exists:', !!dbAttachment.downloadUrl);

        // Fetch fresh message from Google Chat API
        console.log('\n🔄 Fetching fresh message from Google Chat API...');
        
        try {
            const messageResponse = await chatApi.spaces.messages.get({
                name: messageName
            });
            
            const freshMessage = messageResponse.data;
            console.log('\n✅ Fresh message retrieved');
            console.log('Message keys:', Object.keys(freshMessage));
            
            // Check for attachments
            const freshAttachments = [];
            if (freshMessage.attachment) {
                console.log('\n📎 Found singular "attachment" field');
                console.log('Attachment keys:', Object.keys(freshMessage.attachment));
                console.log('Full attachment:', JSON.stringify(freshMessage.attachment, null, 2));
                freshAttachments.push(freshMessage.attachment);
            }
            
            if (freshMessage.attachments && Array.isArray(freshMessage.attachments)) {
                console.log('\n📎 Found plural "attachments" array');
                console.log('Attachments count:', freshMessage.attachments.length);
                freshAttachments.push(...freshMessage.attachments);
            }

            console.log(`\n📊 Total fresh attachments: ${freshAttachments.length}`);
            
            freshAttachments.forEach((att, index) => {
                console.log(`\n📎 Fresh Attachment ${index + 1}:`);
                console.log('   Keys:', Object.keys(att));
                console.log('   Name:', att.name);
                console.log('   Content Name:', att.contentName);
                console.log('   Content Type:', att.contentType);  
                console.log('   Download URL:', att.downloadUrl ? 'Present' : 'Missing');
                console.log('   Thumbnail URL:', att.thumbnailUrl ? 'Present' : 'Missing');
                
                // Show a snippet of URLs
                if (att.downloadUrl) {
                    console.log('   Download URL snippet:', att.downloadUrl.substring(0, 100) + '...');
                }
                if (att.thumbnailUrl) {
                    console.log('   Thumbnail URL snippet:', att.thumbnailUrl.substring(0, 100) + '...');
                }
            });

            // Test if we can match
            console.log('\n🔍 Matching test:');
            const match = freshAttachments.find(att => 
                att.name === dbAttachment.name || 
                att.contentName === dbAttachment.contentName ||
                att.contentType === dbAttachment.contentType
            );
            
            console.log('Match found:', !!match);
            if (match) {
                console.log('Matched by:', 
                    match.name === dbAttachment.name ? 'name' :
                    match.contentName === dbAttachment.contentName ? 'contentName' : 'contentType'
                );
            }

        } catch (apiError) {
            console.log('❌ API Error:', apiError.message);
        }

    } catch (error) {
        console.error('💥 Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debugFreshAttachments();
