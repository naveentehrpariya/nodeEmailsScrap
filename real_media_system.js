const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

class RealMediaSystem {
    constructor() {
        this.mediaCache = new Map();
        this.downloadQueue = [];
        this.isProcessing = false;
    }

    async optimizeAllChatsForRealMedia() {
        console.log('🎯 OPTIMIZING CHATS FOR REAL MEDIA DISPLAY');
        console.log('=========================================');
        
        try {
            await mongoose.connect(process.env.DB_URL_OFFICE);
            console.log('✅ Connected to database');
            
            // Get all chats with attachments
            const chats = await Chat.find({ 'messages.attachments': { $exists: true, $not: { $size: 0 } } });
            
            if (chats.length === 0) {
                console.log('❌ No chats with attachments found');
                return;
            }
            
            console.log(`📊 Found ${chats.length} chats with attachments`);
            let totalUpdated = 0;
            
            for (const chat of chats) {
                console.log(`\n🔄 Processing chat: ${chat.displayName || 'Unknown'}`);
                let chatUpdated = false;
                
                for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
                    const message = chat.messages[msgIndex];
                    
                    if (message.attachments && message.attachments.length > 0) {
                        for (let attIndex = 0; attIndex < message.attachments.length; attIndex++) {
                            const attachment = message.attachments[attIndex];
                            
                            // Skip if already optimized
                            if (attachment.realMediaOptimized) continue;
                            
                            const updated = await this.optimizeAttachmentForRealMedia(
                                attachment, 
                                chat._id.toString(), 
                                msgIndex, 
                                attIndex
                            );
                            
                            if (updated) {
                                attachment.realMediaOptimized = true;
                                attachment.optimizedAt = new Date();
                                chatUpdated = true;
                                totalUpdated++;
                                console.log(`  ✅ Optimized: ${attachment.contentName}`);
                            }
                        }
                    }
                }
                
                if (chatUpdated) {
                    await chat.save();
                    console.log(`  💾 Chat updated`);
                }
            }
            
            console.log(`\n📊 OPTIMIZATION COMPLETE:`);
            console.log(`  ✅ Attachments optimized: ${totalUpdated}`);
            console.log(`  🚀 Real media URLs ready for frontend`);
            
        } catch (error) {
            console.error('❌ Error optimizing chats:', error);
        } finally {
            await mongoose.disconnect();
        }
    }
    
    async optimizeAttachmentForRealMedia(attachment, chatId, messageIndex, attachmentIndex) {
        try {
            // Create multiple URL options for the frontend to try
            const urlOptions = [];
            
            // Option 1: Direct Google URLs (will work if user is authenticated)
            if (attachment.downloadUri) {
                urlOptions.push({
                    type: 'direct',
                    url: attachment.downloadUri,
                    priority: 1
                });
            }
            
            if (attachment.thumbnailUri) {
                urlOptions.push({
                    type: 'thumbnail',
                    url: attachment.thumbnailUri,
                    priority: 2
                });
            }
            
            // Option 2: Proxy URLs (for bypassing CORS)
            if (attachment.downloadUri) {
                urlOptions.push({
                    type: 'proxy',
                    url: `http://localhost:5001/api/media/${chatId}/${messageIndex}/${attachmentIndex}`,
                    priority: 3
                });
            }
            
            // Option 3: Monitoring sample as fallback
            const sampleFile = this.getSampleFileForType(attachment.contentType, attachment.contentName);
            urlOptions.push({
                type: 'sample',
                url: `http://localhost:8080/api/media/monitoring/${sampleFile}`,
                priority: 4
            });
            
            // Update attachment with all URL options
            attachment.mediaUrls = urlOptions;
            attachment.primaryMediaUrl = urlOptions[0]?.url; // Best option first
            attachment.fallbackMediaUrl = urlOptions[urlOptions.length - 1]?.url; // Sample as last resort
            
            // For images, try to use thumbnail as immediate display
            if (attachment.contentType?.startsWith('image/') && attachment.thumbnailUri) {
                attachment.displayUrl = attachment.thumbnailUri;
                attachment.fullSizeUrl = attachment.downloadUri;
            } else {
                attachment.displayUrl = attachment.primaryMediaUrl;
            }
            
            return true;
            
        } catch (error) {
            console.error(`❌ Error optimizing ${attachment.contentName}:`, error.message);
            return false;
        }
    }
    
    getSampleFileForType(contentType, filename) {
        if (contentType?.includes('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename)) {
            return 'sample_screenshot.png';
        }
        if (contentType?.includes('video/') || /\.(mp4|avi|mov|wmv|webm|mkv)$/i.test(filename)) {
            return 'sample_video.mp4';
        }
        if (contentType?.includes('pdf') || /\.pdf$/i.test(filename)) {
            return 'sample_document.pdf';
        }
        return 'sample_document.pdf';
    }

    async createOptimizedTestChat() {
        console.log('\n📱 CREATING OPTIMIZED TEST CHAT WITH REAL GOOGLE URLS');
        console.log('===================================================');
        
        // Delete existing optimized test chat
        await Chat.deleteMany({ displayName: "Real Media Test" });
        
        // Get a real attachment from existing data to use as template
        const existingChat = await Chat.findOne({ 'messages.attachments': { $exists: true, $not: { $size: 0 } } });
        
        if (existingChat) {
            const realAttachment = existingChat.messages.find(m => m.attachments && m.attachments.length > 0)?.attachments[0];
            
            if (realAttachment) {
                const optimizedChat = new Chat({
                    displayName: "Real Media Test",
                    account: "real_media_test",
                    lastMessageTime: new Date(),
                    messages: [
                        {
                            text: "🖼️ This shows REAL Google Chat image with fallback",
                            createdAt: new Date(Date.now() - 60000 * 5),
                            attachments: [
                                {
                                    contentName: realAttachment.contentName,
                                    contentType: realAttachment.contentType,
                                    fileSize: realAttachment.fileSize || 0,
                                    
                                    // Multiple URL options for frontend to try
                                    mediaUrls: [
                                        {
                                            type: 'direct',
                                            url: realAttachment.downloadUri,
                                            priority: 1
                                        },
                                        {
                                            type: 'thumbnail', 
                                            url: realAttachment.thumbnailUri,
                                            priority: 2
                                        },
                                        {
                                            type: 'sample',
                                            url: 'http://localhost:8080/api/media/monitoring/sample_screenshot.png',
                                            priority: 3
                                        }
                                    ],
                                    
                                    // Primary URLs for immediate use
                                    displayUrl: realAttachment.thumbnailUri || realAttachment.downloadUri,
                                    primaryMediaUrl: realAttachment.downloadUri,
                                    fallbackMediaUrl: 'http://localhost:8080/api/media/monitoring/sample_screenshot.png',
                                    
                                    // Original Google URLs
                                    downloadUri: realAttachment.downloadUri,
                                    thumbnailUri: realAttachment.thumbnailUri,
                                    
                                    // Optimization flags
                                    realMediaOptimized: true,
                                    optimizedAt: new Date(),
                                    
                                    // Legacy compatibility
                                    downloadUrl: realAttachment.downloadUri,
                                    thumbnailUrl: realAttachment.thumbnailUri
                                }
                            ]
                        },
                        {
                            text: "💡 If Google URLs fail, it will show sample media automatically",
                            createdAt: new Date(),
                            attachments: []
                        }
                    ]
                });
                
                await optimizedChat.save();
                console.log('✅ Optimized test chat created with real Google URLs');
                console.log(`📱 Chat ID: ${optimizedChat._id}`);
                console.log(`🔗 Primary URL: ${realAttachment.downloadUri?.substring(0, 80)}...`);
                console.log(`🖼️ Thumbnail URL: ${realAttachment.thumbnailUri?.substring(0, 80)}...`);
            }
        }
    }
}

// Run the optimization
async function main() {
    const system = new RealMediaSystem();
    
    console.log('🚀 STARTING REAL MEDIA OPTIMIZATION SYSTEM');
    console.log('==========================================');
    
    await system.optimizeAllChatsForRealMedia();
    await system.createOptimizedTestChat();
    
    console.log('\n🎯 REAL MEDIA SYSTEM READY!');
    console.log('===========================');
    console.log('✅ All chats optimized with real Google URLs');
    console.log('✅ Fallback system in place for authentication issues');  
    console.log('✅ Frontend can now try real media first, samples as backup');
    console.log('');
    console.log('📱 TO TEST:');
    console.log('1. Open http://localhost:3000');
    console.log('2. Look for "Real Media Test" chat');
    console.log('3. Should show actual Google Chat media');
    console.log('4. If authentication fails, shows sample media');
}

main().catch(console.error);
