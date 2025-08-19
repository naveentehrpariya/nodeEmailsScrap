const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function inspectAttachments() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        // Get the CMC chat specifically
        const cmcChat = await Chat.findOne({ displayName: 'CMC' });
        
        if (!cmcChat) {
            console.log('CMC chat not found');
            return;
        }

        console.log(`\\nCMC Chat found with ${cmcChat.messages.length} messages`);

        for (let i = 0; i < cmcChat.messages.length; i++) {
            const message = cmcChat.messages[i];
            console.log(`\\n--- Message ${i + 1} ---`);
            console.log(`Text: "${message.text || '(no text)'}"`);
            console.log(`Has attachments array:`, Array.isArray(message.attachments));
            console.log(`Attachments length:`, message.attachments ? message.attachments.length : 'N/A');
            
            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach((att, idx) => {
                    console.log(`  Attachment ${idx + 1}:`);
                    console.log(`    Name: ${att.name}`);
                    console.log(`    Content Type: ${att.contentType}`);
                    console.log(`    Download URI: ${att.downloadUri ? 'Present' : 'Missing'}`);
                    console.log(`    Download Status: ${att.downloadStatus}`);
                    console.log(`    Local Path: ${att.localPath}`);
                    console.log(`    File Size: ${att.fileSize}`);
                });
            } else {
                console.log('  No attachments in this message');
            }
        }

        // Also try to find any message with attachments regardless of chat
        const anyMessageWithAttachments = await Chat.findOne(
            { 'messages.attachments.0': { $exists: true } },
            { 'messages.$': 1, displayName: 1 }
        );

        if (anyMessageWithAttachments) {
            console.log('\\n\\n=== Found message with attachments ===');
            console.log('Chat:', anyMessageWithAttachments.displayName);
            console.log('Message:', JSON.stringify(anyMessageWithAttachments.messages[0], null, 2));
        } else {
            console.log('\\n\\nNo messages with attachments found in any chat');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectAttachments();
