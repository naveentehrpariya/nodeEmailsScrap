const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function updateSamplePaths() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Get CMC chat
        const cmcChat = await Chat.findOne({ displayName: 'CMC' });
        
        if (cmcChat) {
            console.log('Updating CMC chat attachments...');
            
            for (let i = 0; i < cmcChat.messages.length; i++) {
                const message = cmcChat.messages[i];
                if (message.attachments && message.attachments.length > 0) {
                    for (let j = 0; j < message.attachments.length; j++) {
                        const attachment = message.attachments[j];
                        // Map content types to sample files
                        if (attachment.contentType === 'image/png' || attachment.contentType === 'image/jpeg') {
                            attachment.localPath = 'sample_image.png';
                        } else if (attachment.contentType === 'video/mp4' || attachment.contentType === 'video/quicktime') {
                            attachment.localPath = 'sample_video.mp4';
                        } else if (attachment.contentType === 'application/pdf') {
                            attachment.localPath = 'sample.pdf';
                        } else {
                            attachment.localPath = 'sample.txt';
                        }
                        
                        attachment.downloadStatus = 'completed';
                        attachment.fileSize = 1024; // Sample size
                        
                        console.log(`✓ Updated ${attachment.contentName} -> ${attachment.localPath}`);
                    }
                }
            }
            
            await cmcChat.save();
            console.log('✓ CMC chat updated');
        }

        // Also update first Direct Message chat
        const dmChat = await Chat.findOne({ displayName: '(Direct Message)' });
        
        if (dmChat) {
            console.log('\\nUpdating Direct Message chat attachments...');
            let updated = 0;
            
            for (const message of dmChat.messages) {
                if (message.attachments && message.attachments.length > 0 && updated < 3) {
                    for (const attachment of message.attachments) {
                        if (attachment.contentType === 'image/png' || attachment.contentType === 'image/jpeg') {
                            attachment.localPath = 'sample_image.png';
                        } else if (attachment.contentType === 'video/mp4' || attachment.contentType === 'video/quicktime') {
                            attachment.localPath = 'sample_video.mp4';
                        } else if (attachment.contentType === 'application/pdf') {
                            attachment.localPath = 'sample.pdf';
                        } else {
                            attachment.localPath = 'sample.txt';
                        }
                        
                        attachment.downloadStatus = 'completed';
                        attachment.fileSize = 1024;
                        
                        console.log(`✓ Updated ${attachment.contentName} -> ${attachment.localPath}`);
                        updated++;
                    }
                }
            }
            
            await dmChat.save();
            console.log('✓ Direct Message chat updated');
        }

        console.log('\\n✅ Sample paths updated successfully');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

updateSamplePaths();
