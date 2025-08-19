const mongoose = require('mongoose');
const Chat = require('./db/Chat');

async function finalCMCUpdate() {
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
        
        // Mapping of attachment content names to downloaded filenames
        const fileMapping = {
            'Image_20250816_004022_952.png': '1755293430545_Image_20250816_004022_952.png',
            'Video_20250816_004035_409.mp4': '1755293432522_Video_20250816_004035_409.mp4',
            'macbookbill.pdf': '1755293434379_macbookbill.pdf'
        };
        
        let updatedCount = 0;
        
        // Update messages with attachments
        for (const message of cmcChat.messages) {
            if (message.attachments && message.attachments.length > 0) {
                console.log(`\nUpdating message: "${(message.text || '(no text)').substring(0, 30)}..."`);
                
                for (const attachment of message.attachments) {
                    // Try to find matching file by checking various name fields
                    let contentName = attachment.contentName || attachment.fileName || attachment.filename || attachment.name;
                    
                    // Extract just the filename if it's a full resource path
                    if (contentName && contentName.includes('/')) {
                        // Try to get filename from attachment name patterns
                        const parts = contentName.split('/');
                        contentName = parts[parts.length - 1]; // Get last part
                    }
                    
                    // Look for actual content name in the processed attachments
                    // We know the attachment names from our earlier raw API calls
                    const knownNames = Object.keys(fileMapping);
                    let matchedName = null;
                    
                    // Try exact match first
                    if (knownNames.includes(contentName)) {
                        matchedName = contentName;
                    } else {
                        // If no exact match, check if this attachment has the right media type
                        if (attachment.mediaType === 'image' && !matchedName) {
                            matchedName = knownNames.find(name => name.includes('Image_'));
                        } else if (attachment.mediaType === 'video' && !matchedName) {
                            matchedName = knownNames.find(name => name.includes('Video_'));
                        } else if (attachment.mediaType === 'document' && !matchedName) {
                            matchedName = knownNames.find(name => name.includes('macbookbill'));
                        }
                    }
                    
                    if (matchedName && fileMapping[matchedName]) {
                        const localFileName = fileMapping[matchedName];
                        const localPath = `/media/${localFileName}`;
                        
                        // Update attachment fields
                        attachment.contentName = matchedName;
                        attachment.fileName = matchedName;
                        attachment.filename = matchedName;
                        attachment.localPath = localPath;
                        attachment.downloadStatus = 'completed';
                        attachment.downloadedAt = new Date();
                        
                        // Set proper file size based on what we know
                        if (matchedName.includes('Image_')) {
                            attachment.fileSize = 616727;
                            attachment.mimeType = 'image/png';
                            attachment.contentType = 'image/png';
                        } else if (matchedName.includes('Video_')) {
                            attachment.fileSize = 617988;
                            attachment.mimeType = 'video/mp4';
                            attachment.contentType = 'video/mp4';
                        } else if (matchedName.includes('macbookbill')) {
                            attachment.fileSize = 616684;
                            attachment.mimeType = 'application/pdf';
                            attachment.contentType = 'application/pdf';
                        }
                        
                        console.log(`✅ Updated ${matchedName} -> ${localPath} (${attachment.fileSize} bytes)`);
                        updatedCount++;
                        
                        // Remove one file from mapping so we don't duplicate
                        delete fileMapping[matchedName];
                    } else {
                        console.log(`❌ No mapping found for attachment with contentName: ${contentName}, mediaType: ${attachment.mediaType}`);
                    }
                }
            }
        }
        
        // Save the updated chat
        await cmcChat.save();
        console.log(`\n🎉 Updated ${updatedCount} attachments with local file paths!`);
        
        // Verify the updates
        console.log('\n=== FINAL VERIFICATION ===');
        const verifyChat = await Chat.findOne({ displayName: /CMC/i });
        const messagesWithAttachments = verifyChat.messages.filter(msg => 
            msg.attachments && msg.attachments.length > 0
        );
        
        console.log(`Found ${messagesWithAttachments.length} messages with attachments:`);
        messagesWithAttachments.forEach((msg, i) => {
            console.log(`\nMessage ${i + 1}: "${(msg.text || '(no text)').substring(0, 30)}..."`);
            msg.attachments.forEach((att, j) => {
                console.log(`  Attachment ${j + 1}: ${att.contentName || 'unnamed'}`);
                console.log(`    Local Path: ${att.localPath || 'not available'}`);
                console.log(`    Status: ${att.downloadStatus || 'not set'}`);
                console.log(`    Media Type: ${att.mediaType || 'not set'}`);
                console.log(`    File Size: ${att.fileSize || 0} bytes`);
                console.log(`    MIME Type: ${att.mimeType || 'not set'}`);
            });
        });
        
    } catch (error) {
        console.error('Final update failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the final update
finalCMCUpdate();
