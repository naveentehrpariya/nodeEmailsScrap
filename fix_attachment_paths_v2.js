const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Chat = require('./db/Chat');

async function fixAttachmentPathsV2() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        const mediaDir = path.join(__dirname, 'media');
        const mediaFiles = fs.readdirSync(mediaDir).filter(file => {
            const stat = fs.statSync(path.join(mediaDir, file));
            return stat.isFile() && !file.startsWith('.');
        });

        console.log('Found media files:', mediaFiles.length);

        // Use a cursor to iterate over all chats to avoid memory issues
        const cursor = Chat.find().cursor();

        let updatedChats = 0;
        let fixedAttachments = 0;

        for (let chat = await cursor.next(); chat != null; chat = await cursor.next()) {
            let isChatModified = false;

            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        if (attachment.downloadStatus === 'completed' && !attachment.localPath) {
                            const expectedExtension = getExtensionFromContentType(attachment.contentType);
                            const matchingFile = mediaFiles.find(file => file.endsWith(expectedExtension));

                            if (matchingFile) {
                                attachment.localPath = matchingFile;
                                fixedAttachments++;
                                isChatModified = true;
                                console.log(`  ✅ Fixed attachment in chat ${chat._id}: set localPath to ${matchingFile}`);
                            } else {
                                console.log(`  ❌ No matching file for content type ${attachment.contentType}`);
                            }
                        }
                    }
                }
            }

            if (isChatModified) {
                await chat.save();
                updatedChats++;
            }
        }

        console.log(`\n✅ Fix completed:`);
        console.log(`   - Updated chats: ${updatedChats}`);
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
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'application/pdf': '.pdf',
    };
    return typeMap[contentType] || '.bin';
}

fixAttachmentPathsV2();
