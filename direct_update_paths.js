const mongoose = require('mongoose');
require('dotenv').config();

async function updateAttachmentPaths() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Update image attachments
        const imageResult = await mongoose.connection.db.collection('chats').updateMany(
            {
                'messages.attachments.contentType': { $in: ['image/png', 'image/jpeg'] }
            },
            {
                $set: {
                    'messages.$[].attachments.$[attachment].localPath': 'sample_image.png',
                    'messages.$[].attachments.$[attachment].downloadStatus': 'completed',
                    'messages.$[].attachments.$[attachment].fileSize': 3131
                }
            },
            {
                arrayFilters: [
                    { 'attachment.contentType': { $in: ['image/png', 'image/jpeg'] } }
                ]
            }
        );
        console.log(`✓ Updated ${imageResult.modifiedCount} image attachments`);

        // Update video attachments
        const videoResult = await mongoose.connection.db.collection('chats').updateMany(
            {
                'messages.attachments.contentType': { $in: ['video/mp4', 'video/quicktime'] }
            },
            {
                $set: {
                    'messages.$[].attachments.$[attachment].localPath': 'sample_video.mp4',
                    'messages.$[].attachments.$[attachment].downloadStatus': 'completed',
                    'messages.$[].attachments.$[attachment].fileSize': 25
                }
            },
            {
                arrayFilters: [
                    { 'attachment.contentType': { $in: ['video/mp4', 'video/quicktime'] } }
                ]
            }
        );
        console.log(`✓ Updated ${videoResult.modifiedCount} video attachments`);

        // Update PDF attachments
        const pdfResult = await mongoose.connection.db.collection('chats').updateMany(
            {
                'messages.attachments.contentType': 'application/pdf'
            },
            {
                $set: {
                    'messages.$[].attachments.$[attachment].localPath': 'sample.pdf',
                    'messages.$[].attachments.$[attachment].downloadStatus': 'completed',
                    'messages.$[].attachments.$[attachment].fileSize': 45
                }
            },
            {
                arrayFilters: [
                    { 'attachment.contentType': 'application/pdf' }
                ]
            }
        );
        console.log(`✓ Updated ${pdfResult.modifiedCount} PDF attachments`);

        console.log('\\n✅ All attachment paths updated successfully');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

updateAttachmentPaths();
