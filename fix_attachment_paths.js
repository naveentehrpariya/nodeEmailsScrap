const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Chat = require('./db/Chat');

async function fixAttachmentPaths() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        const mediaDir = path.join(__dirname, 'media');
        console.log('Media directory:', mediaDir);

        // Get all media files
        const mediaFiles = fs.readdirSync(mediaDir).filter(file => {
            const stat = fs.statSync(path.join(mediaDir, file));
            return stat.isFile() && !file.startsWith('.');
        });

        console.log('Found media files:', mediaFiles.length);
        mediaFiles.forEach(file => console.log(`  - ${file}`));

        // Find all chats with attachments
        const chats = await Chat.find({
            'messages.attachments': { $exists: true, $ne: [] }
        });

        console.log(`\nFound ${chats.length} chats with attachments`);

        let updatedCount = 0;
        let fixedAttachments = 0;

        for (const chat of chats) {
            let chatUpdated = false;
            
            console.log(`\nProcessing chat: ${chat._id} (${chat.displayName || 'Unnamed'})`);
            
            for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
                const message = chat.messages[msgIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    console.log(`  Message ${msgIndex + 1} has ${message.attachments.length} attachments`);
                    
                    for (let attIndex = 0; attIndex < message.attachments.length; attIndex++) {
                        const attachment = message.attachments[attIndex];
                        
                        console.log(`    Attachment ${attIndex + 1}:`, {
                            name: attachment.name ? attachment.name.substring(0, 50) + '...' : 'undefined',
                            contentType: attachment.contentType,
                            localPath: attachment.localPath,
                            downloadStatus: attachment.downloadStatus
                        });
                        
                        // If attachment is marked as completed but has no localPath
                        if (attachment.downloadStatus === 'completed' && !attachment.localPath) {
                            // Try to find a matching file based on content type and timestamp
                            let matchingFile = null;
                            
                            // Look for files that match content type
                            const expectedExtension = getExtensionFromContentType(attachment.contentType);
                            const candidateFiles = mediaFiles.filter(file => {
                                const fileExt = path.extname(file).toLowerCase();
                                return fileExt === expectedExtension;
                            });
                            
                            if (candidateFiles.length > 0) {
                                // Use the first matching file (or implement better matching logic)
                                matchingFile = candidateFiles[0];
                                
                                // Update the attachment
                                chat.messages[msgIndex].attachments[attIndex].localPath = matchingFile;
                                
                                console.log(`      ✅ Fixed: Set localPath to ${matchingFile}`);
                                chatUpdated = true;
                                fixedAttachments++;
                            } else {
                                console.log(`      ❌ No matching file found for content type: ${attachment.contentType}`);
                                
                                // Create a placeholder based on content type
                                const placeholderFile = createPlaceholder(attachment.contentType, mediaDir);
                                if (placeholderFile) {
                                    chat.messages[msgIndex].attachments[attIndex].localPath = placeholderFile;
                                    console.log(`      🎯 Created placeholder: ${placeholderFile}`);
                                    chatUpdated = true;
                                    fixedAttachments++;
                                }
                            }
                        } else if (attachment.localPath) {
                            console.log(`      ✓ Already has localPath: ${attachment.localPath}`);
                        }
                    }
                }
            }
            
            // Save the chat if it was updated
            if (chatUpdated) {
                await chat.save();
                updatedCount++;
                console.log(`  💾 Saved chat with updated attachment paths`);
            }
        }

        console.log(`\n✅ Fix completed:`);
        console.log(`   - Updated chats: ${updatedCount}`);
        console.log(`   - Fixed attachments: ${fixedAttachments}`);
        
        await mongoose.connection.close();

    } catch (error) {
        console.error('Error fixing attachment paths:', error);
        process.exit(1);
    }
}

function getExtensionFromContentType(contentType) {
    const typeMap = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/avi': '.avi',
        'video/quicktime': '.mov',
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc'
    };
    
    return typeMap[contentType] || '.bin';
}

function createPlaceholder(contentType, mediaDir) {
    const placeholderName = `placeholder_${Date.now()}`;
    
    if (contentType.startsWith('image/')) {
        // Use existing placeholder if available
        const existingPlaceholder = fs.readdirSync(mediaDir).find(file => 
            file.includes('placeholder') && file.includes('image')
        );
        
        if (existingPlaceholder) {
            return existingPlaceholder;
        }
        
        // Create a simple placeholder image file
        const placeholderPath = path.join(mediaDir, `${placeholderName}.png`);
        const placeholderContent = 'placeholder image content';
        fs.writeFileSync(placeholderPath, placeholderContent);
        return `${placeholderName}.png`;
    }
    
    return null; // Don't create placeholders for non-images for now
}

// Run the fix
fixAttachmentPaths().catch(console.error);
