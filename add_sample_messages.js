require('dotenv').config();
const mongoose = require('mongoose');
const createSampleMediaFiles = require('./create_sample_media');

// Import models
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function connectDB() {
    try {
        const mongoUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MongoDB URI not found in environment variables');
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

async function addSampleMessagesWithMedia() {
    await connectDB();
    
    console.log('Creating sample media files...');
    const sampleFiles = await createSampleMediaFiles();
    
    console.log('Looking for existing chat spaces...');
    const existingChats = await Chat.find().limit(1);
    
    if (existingChats.length === 0) {
        console.log('No existing chats found. Creating sample chat space...');
        
        // Find an account to use
        const account = await Account.findOne();
        if (!account) {
            console.log('❌ No Google accounts found. Please add an account first via the frontend.');
            process.exit(1);
        }
        
        // Create sample chat
        const sampleChat = new Chat({
            spaceId: 'sample-space-for-testing',
            displayName: 'Test Chat with Media',
            spaceType: 'DIRECT_MESSAGE',
            account: account._id,
            messages: []
        });
        
        await sampleChat.save();
        console.log('✅ Created sample chat space');
        existingChats.push(sampleChat);
    }
    
    const chat = existingChats[0];
    console.log(`Using chat: ${chat.displayName}`);
    
    // Create sample messages with media
    const sampleMessages = [
        {
            messageId: `sample-msg-1-${Date.now()}`,
            text: 'Check out this sample image! 📸',
            senderId: 'sample-user-1',
            senderEmail: 'testuser@example.com',
            senderDisplayName: 'Test User',
            senderDomain: 'example.com',
            createTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
            attachments: [
                {
                    filename: sampleFiles[0].filename,
                    mimeType: sampleFiles[0].mimeType,
                    mediaType: sampleFiles[0].mediaType,
                    isImage: sampleFiles[0].isImage,
                    localPath: sampleFiles[0].localPath,
                    fileSize: sampleFiles[0].fileSize,
                    downloadStatus: 'completed',
                    thumbnailUrl: sampleFiles[0].thumbnailPath ? `/api/media/thumbnails/thumb_sample_image.jpg` : null
                }
            ]
        },
        {
            messageId: `sample-msg-2-${Date.now() + 1}`,
            text: '', // Media-only message
            senderId: 'sample-user-2',
            senderEmail: 'another@example.com',
            senderDisplayName: 'Another User',
            senderDomain: 'example.com',
            createTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
            attachments: [
                {
                    filename: sampleFiles[1].filename,
                    mimeType: sampleFiles[1].mimeType,
                    mediaType: sampleFiles[1].mediaType,
                    isDocument: sampleFiles[1].isDocument,
                    localPath: sampleFiles[1].localPath,
                    fileSize: sampleFiles[1].fileSize,
                    downloadStatus: 'completed'
                },
                {
                    filename: sampleFiles[2].filename,
                    mimeType: sampleFiles[2].mimeType,
                    mediaType: sampleFiles[2].mediaType,
                    isDocument: sampleFiles[2].isDocument,
                    localPath: sampleFiles[2].localPath,
                    fileSize: sampleFiles[2].fileSize,
                    downloadStatus: 'completed'
                }
            ]
        },
        {
            messageId: `sample-msg-3-${Date.now() + 2}`,
            text: 'Here are some documents for your review 📄',
            senderId: 'sample-user-1',
            senderEmail: 'testuser@example.com',
            senderDisplayName: 'Test User',
            senderDomain: 'example.com',
            createTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
            attachments: [
                {
                    filename: 'important_report.pdf',
                    mimeType: 'application/pdf',
                    mediaType: 'document',
                    isDocument: true,
                    localPath: sampleFiles[2].localPath, // Reuse the PDF
                    fileSize: sampleFiles[2].fileSize,
                    downloadStatus: 'completed'
                }
            ]
        }
    ];
    
    // Add messages to the chat
    chat.messages = [...chat.messages, ...sampleMessages];
    chat.lastMessageTime = new Date();
    
    await chat.save();
    
    console.log(`✅ Added ${sampleMessages.length} sample messages with media attachments to chat: ${chat.displayName}`);
    console.log('Sample messages:');
    sampleMessages.forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg.text || '(media only)'} - ${msg.attachments.length} attachments`);
    });
    
    console.log('\n🎉 Sample messages with media created successfully!');
    console.log('You can now test the media preview functionality in the frontend.');
    
    process.exit(0);
}

if (require.main === module) {
    addSampleMessagesWithMedia()
        .catch((error) => {
            console.error('❌ Error adding sample messages:', error);
            process.exit(1);
        });
}

module.exports = addSampleMessagesWithMedia;
