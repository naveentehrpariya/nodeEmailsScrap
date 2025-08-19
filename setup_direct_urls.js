const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function initializeGoogleAPIs() {
    const serviceAccountPath = path.join(__dirname, 'dispatch.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
            'https://www.googleapis.com/auth/chat.messages.readonly',
            'https://www.googleapis.com/auth/chat.spaces.readonly'
        ],
        subject: 'naveendev@crossmilescarrier.com'
    });

    const chatApi = google.chat({ version: 'v1', auth });
    return { chatApi, auth };
}

async function getFreshAttachmentUrls(messageName, chatApi) {
    try {
        const messageResponse = await chatApi.spaces.messages.get({
            name: messageName
        });
        
        const message = messageResponse.data;
        const attachments = [];
        
        // Handle both singular and plural attachment fields
        if (message.attachment) {
            if (typeof message.attachment === 'object' && message.attachment !== null) {
                const keys = Object.keys(message.attachment);
                if (keys.length > 0 && !isNaN(keys[0])) {
                    // Array-like structure: {"0": {...}, "1": {...}}
                    keys.forEach(key => {
                        if (message.attachment[key]) {
                            attachments.push(message.attachment[key]);
                        }
                    });
                } else {
                    // Direct object
                    attachments.push(message.attachment);
                }
            }
        }
        
        if (message.attachments && Array.isArray(message.attachments)) {
            attachments.push(...message.attachments);
        }
        
        return attachments;
    } catch (error) {
        console.log(`   ❌ Failed to get fresh URLs: ${error.message}`);
        return [];
    }
}

async function setupDirectMediaUrls() {
    try {
        console.log('🔗 Setting up direct Google media URLs...\n');
        
        // Initialize Google APIs
        const { chatApi, auth } = await initializeGoogleAPIs();
        
        // Connect to database  
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Find chats with attachments
        const allChats = await Chat.find({});
        const chatsWithMedia = allChats.filter(chat => 
            chat.messages && chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`📊 Found ${chatsWithMedia.length} chats with attachments`);

        let totalAttachments = 0;
        let updatedAttachments = 0;

        for (const chat of chatsWithMedia) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    
                    const messageName = message.messageId || message.name;
                    if (!messageName) {
                        console.log('   ⚠️  Skipping message without ID');
                        continue;
                    }
                    
                    console.log(`\n   📨 Updating message: ${messageName}`);
                    
                    // Get fresh URLs from Google Chat API
                    const freshAttachments = await getFreshAttachmentUrls(messageName, chatApi);
                    
                    if (freshAttachments.length === 0) {
                        console.log('   ❌ No fresh attachments found');
                        continue;
                    }
                    
                    console.log(`   ✓ Found ${freshAttachments.length} fresh attachments`);
                    
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const dbAttachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        // Find matching fresh attachment
                        let freshAttachment = freshAttachments.find(att => 
                            att.name === dbAttachment.name || 
                            att.contentName === dbAttachment.contentName ||
                            (att.contentType === dbAttachment.contentType && freshAttachments.length === 1)
                        );
                        
                        if (!freshAttachment && freshAttachments.length === 1) {
                            freshAttachment = freshAttachments[0];
                        }
                        
                        if (freshAttachment) {
                            // Update with direct Google URLs
                            const downloadUrl = freshAttachment.downloadUri || freshAttachment.downloadUrl;
                            const thumbnailUrl = freshAttachment.thumbnailUri || freshAttachment.thumbnailUrl;
                            
                            if (downloadUrl) {
                                dbAttachment.directMediaUrl = downloadUrl;
                                dbAttachment.downloadStatus = 'direct_url';
                                updatedAttachments++;
                                
                                console.log(`   🔗 Set direct URL for: ${dbAttachment.contentName}`);
                                
                                // Also set thumbnail URL for images
                                if (thumbnailUrl && dbAttachment.contentType?.startsWith('image/')) {
                                    dbAttachment.thumbnailUrl = thumbnailUrl;
                                    console.log(`   🖼️  Set thumbnail URL for: ${dbAttachment.contentName}`);
                                }
                                
                                // Mark as media type for frontend handling
                                dbAttachment.isDirectMedia = true;
                                dbAttachment.mediaSource = 'google_chat';
                                dbAttachment.updatedAt = new Date();
                            } else {
                                console.log(`   ❌ No download URL for: ${dbAttachment.contentName}`);
                            }
                        } else {
                            console.log(`   ❌ Could not match attachment: ${dbAttachment.contentName}`);
                        }
                    }
                    
                    // Small delay to be respectful to Google APIs
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Save updated chat
            await chat.save();
            console.log(`💾 Saved chat "${chat.displayName}"`);
        }

        console.log(`\n🎯 DIRECT URL SETUP RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   🔗 Updated with direct URLs: ${updatedAttachments}`);
        console.log(`   📈 Success rate: ${totalAttachments > 0 ? ((updatedAttachments / totalAttachments) * 100).toFixed(1) : 0}%`);

        if (updatedAttachments > 0) {
            console.log(`\n🎉 SUCCESS! ${updatedAttachments} attachments now have direct Google URLs!`);
            console.log(`🔄 Your frontend can now display media directly from Google servers!`);
            console.log(`\n📋 Next steps:`);
            console.log(`   1. Update your frontend to use 'directMediaUrl' field`);
            console.log(`   2. Handle Google authentication in frontend if needed`);
            console.log(`   3. Add fallback for when URLs expire`);
        } else {
            console.log(`\n😔 No direct URLs could be set up.`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Done setting up direct URLs');
    }
}

setupDirectMediaUrls().catch(console.error);
