const mongoose = require('mongoose');
const Chat = require('../db/Chat');
const UserMapping = require('../db/UserMapping');

async function updateAllMatchingMessages() {
    console.log('🔄 Updating ALL matching messages with resolved user names...');
    
    try {
        await mongoose.connect(process.env.DB_URL || 'mongodb://127.0.0.1:27017/scrapapiapp');
        console.log('✅ Connected to MongoDB');
        
        // Get all user mappings with high confidence
        const userMappings = await UserMapping.find({ 
            confidence: { $gte: 80 }
        }).lean();
        
        console.log(`📋 Found ${userMappings.length} high-confidence user mappings`);
        
        let totalUpdatedMessages = 0;
        
        for (const mapping of userMappings) {
            console.log(`\n🔍 Processing ${mapping.userId} → ${mapping.displayName}`);
            
            // Find all chats that have messages from this user
            const chatsWithUser = await Chat.find({
                'messages.senderId': mapping.userId
            });
            
            console.log(`  Found ${chatsWithUser.length} chats with messages from this user`);
            
            // Update each chat individually
            for (const chat of chatsWithUser) {
                let hasUpdates = false;
                
                // Update all messages from this sender in this chat
                for (const message of chat.messages) {
                    if (message.senderId === mapping.userId) {
                        // Only update if the current name is not already the resolved name
                        if (message.senderDisplayName !== mapping.displayName) {
                            message.senderDisplayName = mapping.displayName;
                            message.senderEmail = mapping.email;
                            message.senderDomain = mapping.domain;
                            hasUpdates = true;
                            totalUpdatedMessages++;
                        }
                    }
                }
                
                // Save the chat if we made updates
                if (hasUpdates) {
                    await chat.save();
                    console.log(`    ✅ Updated messages in chat ${chat.spaceId}`);
                }
            }
        }
        
        console.log(`\n📊 FINAL SUMMARY:`);
        console.log(`  ✅ Total messages updated: ${totalUpdatedMessages}`);
        console.log(`  📋 User mappings processed: ${userMappings.length}`);
        
    } catch (error) {
        console.error('❌ Error updating messages:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

if (require.main === module) {
    updateAllMatchingMessages();
}

module.exports = { updateAllMatchingMessages };
