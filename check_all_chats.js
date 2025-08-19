const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function checkAllChats() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        // Get all chats
        const allChats = await Chat.find({});
        console.log(`Found ${allChats.length} total chats`);

        for (const chat of allChats.slice(0, 5)) { // Check first 5 chats
            console.log(`\n=== Chat: ${chat.displayName || chat.name || 'Unknown'} ===`);
            console.log(`Space: ${chat.space?.name || 'No space'}`);
            console.log(`Messages: ${chat.messages?.length || 0}`);
            
            if (chat.messages && chat.messages.length > 0) {
                // Check first few messages for structure
                for (const message of chat.messages.slice(0, 3)) {
                    console.log(`\nMessage ID: ${message.name}`);
                    console.log(`Text: ${(message.text || '').substring(0, 100)}...`);
                    console.log(`Has attachment field: ${message.attachment ? 'Yes' : 'No'}`);
                    console.log(`Has attachments field: ${message.attachments ? 'Yes' : 'No'}`);
                    
                    if (message.attachment) {
                        console.log(`  Attachment (singular):`, {
                            name: message.attachment.name,
                            contentType: message.attachment.contentType,
                            downloadUri: message.attachment.downloadUri ? 'Present' : 'Missing'
                        });
                    }
                    
                    if (message.attachments && message.attachments.length > 0) {
                        console.log(`  Attachments (plural): ${message.attachments.length}`);
                        message.attachments.forEach((att, idx) => {
                            console.log(`    ${idx + 1}. ${att.name} (${att.contentType})`);
                        });
                    }
                }
            }
        }

        // Check for chats with the singular 'attachment' field
        const chatsWithSingularAttachment = await Chat.find({
            'messages.attachment': { $exists: true }
        });
        console.log(`\nFound ${chatsWithSingularAttachment.length} chats with singular 'attachment' field`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkAllChats();
