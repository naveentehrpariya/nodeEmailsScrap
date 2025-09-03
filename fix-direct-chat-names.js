require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixDirectChatNames() {
    try {
        console.log('🧹 CLEANING USER MAPPINGS AND FIXING DIRECT CHAT NAMES');
        console.log('=' .repeat(60));
        
        // Connect to database
        const dbUrl = process.env.DB_URL_OFFICE || process.env.MONGODB_URI;
        if (!dbUrl) {
            throw new Error('Database URL not found. Please set DB_URL_OFFICE or MONGODB_URI in .env file');
        }
        
        await mongoose.connect(dbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to database');

        // Step 1: Clean up problematic user mappings
        console.log('\n🗑️ CLEANING UP USER MAPPINGS');
        console.log('-'.repeat(40));
        
        // Count current mappings
        const beforeCount = await UserMapping.countDocuments();
        console.log(`📊 Current user mappings: ${beforeCount}`);
        
        // Remove mappings with fallback methods that create generic names
        const fallbackMethods = [
            'fallback',
            'fast_sync_fallback', 
            'original_service_fallback',
            'optimized_fallback',
            'enhanced_fallback',
            'smart_fallback'
        ];
        
        const deleteResult = await UserMapping.deleteMany({
            $or: [
                { resolvedBy: { $in: fallbackMethods } },
                { displayName: { $regex: /^User \d+/ } },
                { email: { $regex: /^user-/ } },
                { confidence: { $lt: 50 } }
            ]
        });
        
        console.log(`🗑️ Removed ${deleteResult.deletedCount} problematic user mappings`);
        
        const afterCount = await UserMapping.countDocuments();
        console.log(`📊 Remaining user mappings: ${afterCount}`);
        
        // Step 2: Fix direct chat names to show user IDs instead of generic names
        console.log('\n🔧 FIXING DIRECT CHAT NAMES');
        console.log('-'.repeat(40));
        
        const accounts = await Account.find({ deletedAt: { $exists: false } });
        let fixedChatsCount = 0;
        let totalDirectChats = 0;
        
        for (const account of accounts) {
            console.log(`\n📧 Processing account: ${account.email}`);
            
            // Get all direct message chats for this account
            const directChats = await Chat.find({
                account: account._id,
                spaceType: 'DIRECT_MESSAGE'
            });
            
            totalDirectChats += directChats.length;
            console.log(`  📱 Found ${directChats.length} direct message chats`);
            
            for (const chat of directChats) {
                let needsUpdate = false;
                let newDisplayName = null;
                let newParticipants = [];
                
                // Extract unique user IDs from messages (excluding current user)
                const userIds = new Set();
                const userDetails = new Map();
                
                chat.messages.forEach(msg => {
                    if (msg.senderId && msg.senderId !== account.email && !msg.isSentByCurrentUser) {
                        userIds.add(msg.senderId);
                        
                        // Store any available details
                        if (msg.senderEmail && !msg.senderEmail.includes('user-')) {
                            userDetails.set(msg.senderId, {
                                email: msg.senderEmail,
                                originalDisplayName: msg.senderDisplayName
                            });
                        }
                    }
                });
                
                // If we found other user IDs, use the first one for display
                if (userIds.size > 0) {
                    const primaryUserId = Array.from(userIds)[0];
                    const userDetail = userDetails.get(primaryUserId);
                    
                    // Determine the best display name
                    if (userDetail && userDetail.email && !userDetail.email.includes('user-')) {
                        // Use email prefix if we have a real email
                        newDisplayName = userDetail.email.split('@')[0];
                        
                        newParticipants = [{
                            userId: primaryUserId,
                            email: userDetail.email,
                            displayName: newDisplayName,
                            type: 'HUMAN'
                        }];
                        
                        console.log(`    ✅ Chat ${chat.spaceId}: Using email-based name "${newDisplayName}"`);
                    } else {
                        // Show the user ID directly (last 8 characters for readability)
                        const shortId = primaryUserId.includes('/') ? 
                            primaryUserId.split('/').pop().substring(0, 8) : 
                            primaryUserId.substring(0, 8);
                        
                        newDisplayName = `User ${shortId}`;
                        
                        newParticipants = [{
                            userId: primaryUserId,
                            email: `unknown-${shortId}@crossmilescarrier.com`,
                            displayName: newDisplayName,
                            type: 'HUMAN'
                        }];
                        
                        console.log(`    ℹ️ Chat ${chat.spaceId}: Using user ID "${newDisplayName}"`);
                    }
                    
                    needsUpdate = true;
                } else {
                    // No other users found, might be a self-chat
                    newDisplayName = 'My Notes';
                    newParticipants = [];
                    console.log(`    📝 Chat ${chat.spaceId}: Self-chat - "${newDisplayName}"`);
                    needsUpdate = true;
                }
                
                // Update the chat if needed
                if (needsUpdate && newDisplayName !== chat.displayName) {
                    try {
                        await Chat.updateOne(
                            { _id: chat._id },
                            {
                                $set: {
                                    displayName: newDisplayName,
                                    participants: newParticipants
                                }
                            }
                        );
                        
                        fixedChatsCount++;
                    } catch (updateError) {
                        console.error(`    ❌ Failed to update chat ${chat.spaceId}:`, updateError.message);
                    }
                }
            }
        }
        
        // Step 3: Update message sender names to be consistent
        console.log('\n📨 UPDATING MESSAGE SENDER NAMES');
        console.log('-'.repeat(40));
        
        let updatedMessagesCount = 0;
        
        for (const account of accounts) {
            const allChats = await Chat.find({ account: account._id });
            
            for (const chat of allChats) {
                let chatUpdated = false;
                
                chat.messages.forEach(msg => {
                    // Fix sender display names that look like generic fallbacks
                    if (msg.senderDisplayName && 
                        (msg.senderDisplayName.startsWith('User ') || 
                         msg.senderDisplayName.includes('users/') ||
                         msg.senderDisplayName === msg.senderId)) {
                        
                        if (msg.senderEmail && !msg.senderEmail.includes('user-')) {
                            // Use email prefix if we have a real email
                            msg.senderDisplayName = msg.senderEmail.split('@')[0];
                            chatUpdated = true;
                            updatedMessagesCount++;
                        } else if (msg.senderId) {
                            // Use shortened user ID
                            const shortId = msg.senderId.includes('/') ? 
                                msg.senderId.split('/').pop().substring(0, 8) : 
                                msg.senderId.substring(0, 8);
                            msg.senderDisplayName = `User ${shortId}`;
                            chatUpdated = true;
                            updatedMessagesCount++;
                        }
                    }
                });
                
                if (chatUpdated) {
                    await chat.save();
                }
            }
        }
        
        // Final summary
        console.log('\n🎉 CLEANUP COMPLETED');
        console.log('=' .repeat(30));
        console.log(`🗑️ Removed user mappings: ${deleteResult.deletedCount}`);
        console.log(`📱 Total direct chats processed: ${totalDirectChats}`);
        console.log(`✅ Fixed chat names: ${fixedChatsCount}`);
        console.log(`📨 Updated message sender names: ${updatedMessagesCount}`);
        
        console.log('\n💡 RESULTS:');
        console.log('  - Direct chats now show meaningful names or user IDs');
        console.log('  - Removed problematic user mappings causing confusion');
        console.log('  - Message senders show consistent naming');
        console.log('  - System will create fewer fallback mappings going forward');
        
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error fixing direct chat names:', error.message);
        console.error('Stack trace:', error.stack);
        
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('Failed to disconnect:', disconnectError.message);
        }
        
        process.exit(1);
    }
}

// Run if this script is executed directly
if (require.main === module) {
    fixDirectChatNames();
}

module.exports = fixDirectChatNames;
