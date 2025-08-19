const mongoose = require('mongoose');
const Chat = require('./db/Chat');

async function addAttachmentsToCMC() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
        // Find CMC space
        const cmcChat = await Chat.findById('689f98dfb78527b14e17bf6f');
        
        if (!cmcChat) {
            console.log('CMC space not found');
            return;
        }
        
        console.log(`Found CMC space with ${cmcChat.messageCount} messages`);
        
        // Find the specific messages and add attachments
        const messageUpdates = [
            {
                messageId: 'spaces/AAQAPUbCMD0/messages/2ZbIX6lc2xo.2ZbIX6lc2xo',
                attachment: {
                    filename: 'Image_20250816_004022_952.png',
                    contentName: 'Image_20250816_004022_952.png',
                    fileName: 'Image_20250816_004022_952.png',
                    fileSize: 616727,
                    mimeType: 'image/png',
                    contentType: 'image/png',
                    mediaType: 'image',
                    localPath: '/media/1755293430545_Image_20250816_004022_952.png',
                    downloadStatus: 'completed',
                    downloadedAt: new Date(),
                    isImage: true,
                    isVideo: false,
                    isDocument: false,
                    isAudio: false,
                    createdAt: new Date()
                }
            },
            {
                messageId: 'spaces/AAQAPUbCMD0/messages/9zIiSqBD4_M.9zIiSqBD4_M',
                attachment: {
                    filename: 'Video_20250816_004035_409.mp4',
                    contentName: 'Video_20250816_004035_409.mp4',
                    fileName: 'Video_20250816_004035_409.mp4',
                    fileSize: 617988,
                    mimeType: 'video/mp4',
                    contentType: 'video/mp4',
                    mediaType: 'video',
                    localPath: '/media/1755293432522_Video_20250816_004035_409.mp4',
                    downloadStatus: 'completed',
                    downloadedAt: new Date(),
                    isImage: false,
                    isVideo: true,
                    isDocument: false,
                    isAudio: false,
                    createdAt: new Date()
                }
            },
            {
                messageId: 'spaces/AAQAPUbCMD0/messages/sOcNxtFyBqk.sOcNxtFyBqk',
                attachment: {
                    filename: 'macbookbill.pdf',
                    contentName: 'macbookbill.pdf',
                    fileName: 'macbookbill.pdf',
                    fileSize: 616684,
                    mimeType: 'application/pdf',
                    contentType: 'application/pdf',
                    mediaType: 'document',
                    localPath: '/media/1755293434379_macbookbill.pdf',
                    downloadStatus: 'completed',
                    downloadedAt: new Date(),
                    isImage: false,
                    isVideo: false,
                    isDocument: true,
                    isAudio: false,
                    createdAt: new Date()
                }
            }
        ];
        
        let updatedCount = 0;
        
        // Update each message with its attachment
        for (const update of messageUpdates) {
            const message = cmcChat.messages.find(msg => msg.messageId === update.messageId);
            
            if (message) {
                console.log(`\nUpdating message: ${update.messageId}`);
                console.log(`Adding attachment: ${update.attachment.contentName}`);
                
                // Add the attachment to this message
                message.attachments = [update.attachment];
                updatedCount++;
                
                console.log(`✅ Added ${update.attachment.contentName} to message`);
            } else {
                console.log(`❌ Message not found: ${update.messageId}`);
            }
        }
        
        // Save the updated chat
        if (updatedCount > 0) {
            await cmcChat.save();
            console.log(`\n🎉 Successfully added attachments to ${updatedCount} messages!`);
        }
        
        // Verify the updates
        console.log('\n=== FINAL VERIFICATION ===');
        const verifyChat = await Chat.findById('689f98dfb78527b14e17bf6f');
        const messagesWithAttachments = verifyChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        console.log(`Found ${messagesWithAttachments.length} messages with attachments:`);
        messagesWithAttachments.forEach((msg, i) => {
            console.log(`\nMessage ${i + 1}: "${(msg.text || '(no text)').substring(0, 30)}..." (${msg.messageId})`);
            msg.attachments.forEach((att, j) => {
                console.log(`  Attachment ${j + 1}: ${att.contentName}`);
                console.log(`    Local Path: ${att.localPath}`);
                console.log(`    Status: ${att.downloadStatus}`);
                console.log(`    Media Type: ${att.mediaType}`);
                console.log(`    File Size: ${att.fileSize} bytes`);
            });
        });
        
    } catch (error) {
        console.error('Failed to add attachments:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
addAttachmentsToCMC();
