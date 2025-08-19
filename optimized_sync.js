const { google } = require('googleapis');
const mongoose = require('mongoose');
require('dotenv').config();

// Optimized Chat Schema
const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

class OptimizedChatSync {
    constructor() {
        this.processedCount = 0;
        this.mediaCount = 0;
        this.startTime = Date.now();
    }

    async initializeGoogleChat() {
        const auth = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            ['https://www.googleapis.com/auth/chat.bot'],
            process.env.GOOGLE_USER_EMAIL
        );

        return google.chat({ version: 'v1', auth });
    }

    async syncChatsWithRealMedia() {
        console.log('🚀 OPTIMIZED CHAT SYNC WITH REAL MEDIA URLS');
        console.log('===========================================');
        
        try {
            await mongoose.connect(process.env.DB_URL_OFFICE);
            const chat = await this.initializeGoogleChat();
            
            // Get spaces (much faster than individual message calls)
            console.log('📊 Fetching chat spaces...');
            const spacesResponse = await chat.spaces.list({
                pageSize: 100,
            });

            const spaces = spacesResponse.data.spaces || [];
            console.log(`✅ Found ${spaces.length} chat spaces`);

            for (const space of spaces) {
                await this.processChatSpace(chat, space);
            }

            this.logSyncResults();

        } catch (error) {
            console.error('❌ Sync error:', error.message);
        } finally {
            await mongoose.disconnect();
        }
    }

    async processChatSpace(chatApi, space) {
        try {
            console.log(`\n🔄 Processing: ${space.displayName || space.name}`);
            
            // Get messages for this space (with attachments)
            const messagesResponse = await chatApi.spaces.messages.list({
                parent: space.name,
                pageSize: 100,
                orderBy: 'createTime desc'
            });

            const messages = messagesResponse.data.messages || [];
            const messagesWithAttachments = messages.filter(msg => msg.attachment && msg.attachment.length > 0);
            
            if (messagesWithAttachments.length === 0) {
                console.log('  ⏭️ No attachments found, skipping');
                return;
            }

            console.log(`  📎 Found ${messagesWithAttachments.length} messages with attachments`);

            // Create or update chat document
            const chatDoc = await this.createOrUpdateChat(space, messagesWithAttachments);
            console.log(`  ✅ Chat saved with ${this.mediaCount} media files`);

        } catch (error) {
            console.error(`  ❌ Error processing ${space.displayName}:`, error.message);
        }
    }

    async createOrUpdateChat(space, messages) {
        // Check if chat already exists
        let chatDoc = await Chat.findOne({ 
            $or: [
                { 'space.name': space.name },
                { displayName: space.displayName }
            ]
        });

        if (!chatDoc) {
            chatDoc = new Chat({
                displayName: space.displayName || 'Unknown Chat',
                space: space,
                account: process.env.GOOGLE_USER_EMAIL,
                lastMessageTime: new Date(),
                messages: []
            });
        }

        // Process messages and optimize attachments
        const processedMessages = [];
        
        for (const message of messages) {
            const processedMessage = {
                name: message.name,
                text: message.text || '',
                createdAt: new Date(message.createTime),
                sender: message.sender,
                attachments: []
            };

            // Process attachments with real media URLs
            if (message.attachment) {
                for (let i = 0; i < message.attachment.length; i++) {
                    const attachment = message.attachment[i];
                    const optimizedAttachment = this.optimizeAttachmentUrls(attachment, space.name, processedMessages.length, i);
                    processedMessage.attachments.push(optimizedAttachment);
                    this.mediaCount++;
                }
            }

            processedMessages.push(processedMessage);
        }

        chatDoc.messages = processedMessages;
        chatDoc.lastMessageTime = new Date();
        chatDoc.optimizedAt = new Date();

        await chatDoc.save();
        this.processedCount++;
        
        return chatDoc;
    }

    optimizeAttachmentUrls(attachment, spaceName, messageIndex, attachmentIndex) {
        const optimized = {
            // Original attachment data
            name: attachment.name,
            contentName: attachment.contentName,
            contentType: attachment.contentType,
            
            // Real Google URLs (these are the actual media URLs!)
            downloadUri: attachment.downloadUri,
            thumbnailUri: attachment.thumbnailUri,
            
            // Multiple URL options for frontend
            mediaUrls: [
                {
                    type: 'direct',
                    url: attachment.downloadUri,
                    priority: 1,
                    description: 'Direct Google URL'
                },
                {
                    type: 'thumbnail',
                    url: attachment.thumbnailUri,
                    priority: 2, 
                    description: 'Google thumbnail URL'
                }
            ],

            // Primary display URLs
            primaryMediaUrl: attachment.downloadUri,
            displayUrl: attachment.thumbnailUri || attachment.downloadUri,
            
            // For frontend compatibility
            downloadUrl: attachment.downloadUri,
            thumbnailUrl: attachment.thumbnailUri,
            
            // Metadata
            fileSize: attachment.attachmentDataRef?.resourceName ? 'Available' : 'Unknown',
            source: attachment.source,
            realMediaOptimized: true,
            optimizedAt: new Date(),
            
            // Space info for potential proxy use
            spaceId: spaceName,
            messageIndex: messageIndex,
            attachmentIndex: attachmentIndex
        };

        console.log(`    📎 Optimized: ${attachment.contentName} (${attachment.contentType})`);
        console.log(`       🔗 Direct: ${attachment.downloadUri ? '✅' : '❌'}`);
        console.log(`       🖼️ Thumb:  ${attachment.thumbnailUri ? '✅' : '❌'}`);

        return optimized;
    }

    logSyncResults() {
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        
        console.log('\n' + '='.repeat(60));
        console.log('🎯 OPTIMIZED SYNC COMPLETE');
        console.log('='.repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`💬 Chats processed: ${this.processedCount}`);
        console.log(`📎 Media files found: ${this.mediaCount}`);
        console.log(`🚀 Performance: ${this.mediaCount > 0 ? (this.mediaCount / parseFloat(duration)).toFixed(1) : 0} media/sec`);
        console.log('');
        console.log('✅ READY FOR FRONTEND:');
        console.log('  • Real Google Chat media URLs available');
        console.log('  • Direct download links ready');
        console.log('  • Thumbnail URLs for quick preview');
        console.log('  • No authentication delays');
        console.log('');
        console.log('📱 Next: Open http://localhost:3000 to view media');
        console.log('='.repeat(60));
    }
}

// Update frontend media utilities to handle the optimized URLs
const frontendUpdate = `
// Add this to your mediaUtils.js:

export const getRealMediaURL = (attachment) => {
    console.log('🔍 Getting real media URL for:', attachment?.contentName);
    
    if (!attachment) return null;
    
    // Try direct Google URL first
    if (attachment.downloadUri || attachment.downloadUrl) {
        const url = attachment.downloadUri || attachment.downloadUrl;
        console.log('📡 Using direct Google URL');
        return url;
    }
    
    // Try thumbnail for images
    if (attachment.contentType?.startsWith('image/') && (attachment.thumbnailUri || attachment.thumbnailUrl)) {
        const url = attachment.thumbnailUri || attachment.thumbnailUrl;
        console.log('🖼️ Using Google thumbnail URL');
        return url;
    }
    
    // Fallback to monitoring sample
    if (attachment.employeeMonitored && attachment.localPath) {
        const url = \`http://localhost:8080/api/media/monitoring/\${attachment.localPath}\`;
        console.log('📁 Using monitoring sample URL');
        return url;
    }
    
    console.log('❌ No media URL available');
    return null;
};

// Update your existing getMediaURL function to use this
`;

// Run the optimized sync
async function runOptimizedSync() {
    const sync = new OptimizedChatSync();
    await sync.syncChatsWithRealMedia();
    
    console.log('\n📝 FRONTEND UPDATE NEEDED:');
    console.log(frontendUpdate);
}

// Execute if run directly
if (require.main === module) {
    runOptimizedSync().catch(console.error);
}

module.exports = { OptimizedChatSync };
