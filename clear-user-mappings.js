require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function clearUserMappings() {
    try {
        console.log('🧹 COMPLETELY CLEARING USER MAPPINGS');
        console.log('=' .repeat(50));
        
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

        // Step 1: Clear all user mappings
        console.log('\n🗑️ CLEARING ALL USER MAPPINGS');
        console.log('-'.repeat(40));
        
        const beforeCount = await UserMapping.countDocuments();
        console.log(`📊 Current user mappings: ${beforeCount}`);
        
        if (beforeCount > 0) {
            const deleteResult = await UserMapping.deleteMany({});
            console.log(`🗑️ Deleted ${deleteResult.deletedCount} user mappings`);
        } else {
            console.log('ℹ️ No user mappings to delete');
        }
        
        // Step 2: Update all direct chats to show user IDs
        console.log('\n🔧 UPDATING DIRECT CHATS TO SHOW USER IDs');
        console.log('-'.repeat(40));
        
        const accounts = await Account.find({ deletedAt: { $exists: false } });
        let updatedChatsCount = 0;
        let totalDirectChats = 0;
        
        for (const account of accounts) {
            console.log(`\n📧 Processing account: ${account.email}`);
            
            // Get all direct message chats
            const directChats = await Chat.find({
                account: account._id,
                spaceType: 'DIRECT_MESSAGE'
            });
            
            totalDirectChats += directChats.length;
            console.log(`  📱 Found ${directChats.length} direct message chats`);
            
            for (const chat of directChats) {
                // Find the other user from messages
                const otherUserIds = new Set();
                const userEmails = new Map();
                
                chat.messages.forEach(msg => {
                    if (msg.senderId && !msg.isSentByCurrentUser && msg.senderId !== account.email) {
                        otherUserIds.add(msg.senderId);
                        
                        // Store email if available and looks real
                        if (msg.senderEmail && 
                            msg.senderEmail.includes('@') && 
                            !msg.senderEmail.includes('user-') &&
                            !msg.senderEmail.includes('unknown-')) {
                            userEmails.set(msg.senderId, msg.senderEmail);
                        }
                    }
                });
                
                let newDisplayName = 'Unknown Chat';
                let newParticipants = [];
                
                if (otherUserIds.size > 0) {
                    const primaryUserId = Array.from(otherUserIds)[0];
                    const userEmail = userEmails.get(primaryUserId);
                    
                    if (userEmail) {
                        // Use email prefix for display
                        newDisplayName = userEmail.split('@')[0];
                        newParticipants = [{
                            userId: primaryUserId,
                            email: userEmail,
                            displayName: newDisplayName,
                            type: 'HUMAN'
                        }];
                        console.log(`    ✅ Chat ${chat.spaceId.substring(-10)}: "${newDisplayName}" (from email)`);
                    } else {
                        // Show user ID (shortened)
                        const shortId = primaryUserId.includes('/') ? 
                            primaryUserId.split('/').pop() : primaryUserId;
                        newDisplayName = shortId.substring(0, 8);
                        
                        newParticipants = [{
                            userId: primaryUserId,
                            email: `${shortId}@unknown`,
                            displayName: newDisplayName,
                            type: 'HUMAN'
                        }];
                        console.log(`    🆔 Chat ${chat.spaceId.substring(-10)}: "${newDisplayName}" (user ID)`);
                    }
                } else {
                    // Self chat or no other participants
                    newDisplayName = 'My Notes';
                    newParticipants = [];
                    console.log(`    📝 Chat ${chat.spaceId.substring(-10)}: "${newDisplayName}" (self)`);
                }
                
                // Update the chat
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
                    updatedChatsCount++;
                } catch (updateError) {
                    console.error(`    ❌ Failed to update chat:`, updateError.message);
                }
            }
        }
        
        // Step 3: Clean up message sender names
        console.log('\n📨 CLEANING MESSAGE SENDER NAMES');
        console.log('-'.repeat(40));
        
        let cleanedMessagesCount = 0;
        
        for (const account of accounts) {
            const allChats = await Chat.find({ account: account._id });
            
            for (const chat of allChats) {
                let chatNeedsUpdate = false;
                
                chat.messages.forEach(msg => {
                    if (msg.senderId) {
                        let newSenderName = null;
                        
                        if (msg.isSentByCurrentUser) {
                            newSenderName = 'You';
                        } else if (msg.senderEmail && 
                                  msg.senderEmail.includes('@') && 
                                  !msg.senderEmail.includes('user-') &&
                                  !msg.senderEmail.includes('unknown-')) {
                            // Use email prefix
                            newSenderName = msg.senderEmail.split('@')[0];
                        } else {
                            // Use shortened user ID
                            const shortId = msg.senderId.includes('/') ? 
                                msg.senderId.split('/').pop() : msg.senderId;
                            newSenderName = shortId.substring(0, 8);
                        }
                        
                        if (newSenderName && newSenderName !== msg.senderDisplayName) {
                            msg.senderDisplayName = newSenderName;
                            chatNeedsUpdate = true;
                            cleanedMessagesCount++;
                        }
                    }
                });
                
                if (chatNeedsUpdate) {
                    await chat.save();
                }
            }
        }
        
        console.log(`📨 Cleaned ${cleanedMessagesCount} message sender names`);
        
        // Final summary
        console.log('\n🎉 CLEANUP COMPLETED');
        console.log('=' .repeat(30));
        console.log(`🗑️ Deleted user mappings: ${beforeCount}`);
        console.log(`📱 Updated direct chats: ${updatedChatsCount}/${totalDirectChats}`);
        console.log(`📨 Cleaned message names: ${cleanedMessagesCount}`);
        
        console.log('\n💡 RESULTS:');
        console.log('  - All user mappings removed from database');
        console.log('  - Direct chats show email prefixes or user IDs');
        console.log('  - No more generic "User 12345" fallback names');
        console.log('  - Message senders show consistent identification');
        
        console.log('\n🔄 NEXT STEPS:');
        console.log('  - Chat sync will now work without creating bad user mappings');
        console.log('  - Only real email-based names will be used');
        console.log('  - User IDs will be shown when email is not available');
        
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Error clearing user mappings:', error.message);
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
    clearUserMappings();
}

module.exports = clearUserMappings;
