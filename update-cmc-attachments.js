const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const fs = require('fs').promises;
const path = require('path');

async function updateCMCAttachments() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('Connected to MongoDB');
        
        // Find CMC space
        const cmcChat = await Chat.findOne({ displayName: /CMC/i });
        
        if (!cmcChat) {
            console.log('CMC space not found');
            return;
        }
        
        console.log(`Found CMC space with ${cmcChat.messageCount} messages`);
        
        // Get list of downloaded files
        const mediaFiles = await fs.readdir('./media');
        const downloadedFiles = mediaFiles.filter(file => 
            file.includes('1755293') && !file.startsWith('thumb_') // Filter by timestamp from our download
        );
        
        console.log('Downloaded files:', downloadedFiles);
        
        // Map files to their original names
        const fileMap = {
            'Image_20250816_004022_952.png': downloadedFiles.find(f => f.includes('Image_20250816_004022_952.png')),
            'Video_20250816_004035_409.mp4': downloadedFiles.find(f => f.includes('Video_20250816_004035_409.mp4')),
            'macbookbill.pdf': downloadedFiles.find(f => f.includes('macbookbill.pdf'))
        };
        
        console.log('File mapping:', fileMap);
        
        // Update messages with attachments
        const messagesWithAttachments = cmcChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        let updatedCount = 0;
        
        for (const message of messagesWithAttachments) {
            console.log(`\nUpdating message: ${message.text || '(no text)'}`);
            
            for (const attachment of message.attachments) {
                const originalName = attachment.contentName || attachment.name;
                const localFileName = fileMap[originalName];
                
                if (localFileName) {
                    const localPath = `/media/${localFileName}`;
                    
                    // Update attachment with local information
                    attachment.localPath = localPath;
                    attachment.downloadStatus = 'completed';
                    attachment.downloadedAt = new Date();
                    
                    // Get file stats
                    const stats = await fs.stat(path.join('./media', localFileName));
                    attachment.fileSize = stats.size;
                    attachment.size = stats.size;
                    
                    // Add media type classification
                    if (!attachment.mediaType) {
                        if (attachment.contentType?.includes('image')) attachment.mediaType = 'image';
                        else if (attachment.contentType?.includes('video')) attachment.mediaType = 'video';
                        else if (attachment.contentType?.includes('pdf')) attachment.mediaType = 'document';
                        else attachment.mediaType = 'other';
                    }
                    
                    // Set boolean flags
                    attachment.isImage = attachment.mediaType === 'image';
                    attachment.isVideo = attachment.mediaType === 'video';
                    attachment.isDocument = attachment.mediaType === 'document';
                    attachment.isAudio = attachment.mediaType === 'audio';
                    
                    console.log(`✅ Updated ${originalName} -> ${localPath} (${attachment.fileSize} bytes)`);
                    updatedCount++;
                } else {
                    console.log(`❌ No downloaded file found for ${originalName}`);
                }
            }
        }
        
        // Save the updated chat
        await cmcChat.save();
        console.log(`\n🎉 Updated ${updatedCount} attachments with local paths!`);
        
        // Verify the updates
        console.log('\n=== VERIFICATION ===');
        const updatedChat = await Chat.findOne({ displayName: /CMC/i });
        const updatedMessagesWithAttachments = updatedChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        updatedMessagesWithAttachments.forEach((msg, i) => {
            console.log(`\nMessage ${i + 1}:`);
            msg.attachments.forEach((att, j) => {
                console.log(`  Attachment ${j + 1}: ${att.contentName || att.name}`);
                console.log(`    Local Path: ${att.localPath || 'not set'}`);
                console.log(`    Status: ${att.downloadStatus || 'not set'}`);
                console.log(`    Media Type: ${att.mediaType || 'not set'}`);
                console.log(`    File Size: ${att.fileSize || 'not set'} bytes`);
            });
        });
        
    } catch (error) {
        console.error('Update failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the update
updateCMCAttachments();
