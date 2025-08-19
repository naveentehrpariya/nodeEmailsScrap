const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function checkMediaStatus() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        // Find chats with messages that have attachments
        const chatsWithMedia = await Chat.find({
            'messages.attachments': { $exists: true, $not: { $size: 0 } }
        });

        console.log(`Found ${chatsWithMedia.length} chats with attachments`);

        let totalAttachments = 0;
        let downloadedCount = 0;
        let failedCount = 0;

        for (const chat of chatsWithMedia) {
            console.log(`\nChat: ${chat.displayName || chat.name || 'Unknown'} (${chat.space?.name})`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        totalAttachments++;
                        console.log(`  - ${attachment.name || 'Unnamed'} (${attachment.contentType})`);
                        console.log(`    Download Status: ${attachment.downloadStatus}`);
                        console.log(`    Local Path: ${attachment.localPath}`);
                        console.log(`    Download URI: ${attachment.downloadUri ? 'Present' : 'Missing'}`);
                        
                        if (attachment.downloadStatus === 'completed') {
                            downloadedCount++;
                        } else {
                            failedCount++;
                        }
                    }
                }
            }
        }

        console.log(`\n=== SUMMARY ===`);
        console.log(`Total attachments: ${totalAttachments}`);
        console.log(`Downloaded: ${downloadedCount}`);
        console.log(`Failed/Pending: ${failedCount}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkMediaStatus();
