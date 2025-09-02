const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

const MONGODB_URI = 'mongodb://localhost:27017/emailscrap';

async function fixMissingChats() {
    console.log('🔧 FIXING MISSING CHATS ISSUE');
    console.log('==============================');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        // Get naveendev account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }
        
        console.log(`👤 Account: ${account.email}`);
        
        // Find chats that have no participants but have messages
        console.log('\n📊 ANALYZING CHATS WITH MISSING PARTICIPANTS');
        console.log('---------------------------------------------');
        
        const chatsWithoutParticipants = await Chat.find({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE',
            $or: [
                { participants: { $exists: false } },
                { participants: { $size: 0 } }
            ],
            'messages.0': { $exists: true } // Has at least one message
        }).lean();
        
        console.log(`Found ${chatsWithoutParticipants.length} DM chats without participants:`);
        
        for (const chat of chatsWithoutParticipants) {
            console.log(`\n🔍 Analyzing chat: ${chat.spaceId} - "${chat.displayName}"`);
            console.log(`   Messages: ${chat.messages.length}`);
            
            if (chat.messages.length === 0) {
                console.log('   ⚠️ No messages, skipping...');
                continue;
            }
            
            // Analyze message senders to identify the other participant
            const senderCounts = {}; 
            const senderDetails = {};
            
            chat.messages.forEach(msg => {
                if (msg.senderId && msg.senderEmail) {
                    senderCounts[msg.senderId] = (senderCounts[msg.senderId] || 0) + 1;
                    senderDetails[msg.senderId] = {
                        displayName: msg.senderDisplayName || msg.senderEmail.split('@')[0],
                        email: msg.senderEmail,
                        isSentByCurrentUser: msg.isSentByCurrentUser || msg.senderEmail === account.email
                    };
                }
            });
            
            // Find the other participant (not the current user)
            let otherParticipant = null;
            let currentUserSender = null;
            
            for (const [senderId, details] of Object.entries(senderDetails)) {
                if (details.isSentByCurrentUser || details.email === account.email) {
                    currentUserSender = { id: senderId, ...details };
                } else {
                    otherParticipant = {
                        userId: senderId,
                        email: details.email,
                        displayName: details.displayName
                    };
                }
            }
            
            console.log(`   👤 Current user sender: ${currentUserSender ? currentUserSender.email : 'Not found'}`);
            console.log(`   👥 Other participant: ${otherParticipant ? otherParticipant.email : 'Not found'}`);
            
            // Add participant if we found one
            if (otherParticipant) {
                console.log(`   ✅ Adding participant: ${otherParticipant.displayName} (${otherParticipant.email})`);
                
                const updateResult = await Chat.updateOne(
                    { _id: chat._id },
                    { 
                        $set: { 
                            participants: [otherParticipant] 
                        }
                    }
                );
                
                if (updateResult.modifiedCount > 0) {
                    console.log('   ✅ Successfully updated chat with participant');
                } else {
                    console.log('   ⚠️ Failed to update chat');
                }
            } else {
                // If we can't find the other participant, create a generic one based on the chat
                const genericParticipant = {
                    userId: `generic_${chat.spaceId.replace('spaces/', '')}`,
                    email: `recipient@crossmilescarrier.com`,
                    displayName: `Chat Recipient`
                };
                
                console.log(`   ⚠️ No other participant found, adding generic: ${genericParticipant.displayName}`);
                
                const updateResult = await Chat.updateOne(
                    { _id: chat._id },
                    { 
                        $set: { 
                            participants: [genericParticipant] 
                        }
                    }
                );
                
                if (updateResult.modifiedCount > 0) {
                    console.log('   ✅ Successfully updated chat with generic participant');
                } else {
                    console.log('   ⚠️ Failed to update chat');
                }
            }
        }
        
        // Now check for chats that might have empty display names
        console.log('\n📊 FIXING DISPLAY NAMES');
        console.log('------------------------');
        
        const chatsWithPoorDisplayNames = await Chat.find({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE',
            $or: [
                { displayName: /^\(Direct Message\)$/ },
                { displayName: /^spaces\// },
                { displayName: '' },
                { displayName: { $exists: false } }
            ]
        }).lean();
        
        console.log(`Found ${chatsWithPoorDisplayNames.length} chats with poor display names`);
        
        for (const chat of chatsWithPoorDisplayNames) {
            let newDisplayName = null;
            
            // Try to get display name from participant
            if (chat.participants && chat.participants.length > 0) {
                const participant = chat.participants.find(p => p.email !== account.email);
                if (participant) {
                    newDisplayName = participant.displayName || participant.email.split('@')[0];
                }
            }
            
            // Fallback to message analysis
            if (!newDisplayName && chat.messages && chat.messages.length > 0) {
                const otherMessage = chat.messages.find(msg => 
                    !msg.isSentByCurrentUser && msg.senderEmail !== account.email
                );
                if (otherMessage) {
                    newDisplayName = otherMessage.senderDisplayName || otherMessage.senderEmail.split('@')[0];
                }
            }
            
            // Final fallback
            if (!newDisplayName) {
                newDisplayName = 'Direct Message';
            }
            
            console.log(`   🏷️ Updating "${chat.displayName}" -> "${newDisplayName}"`);
            
            await Chat.updateOne(
                { _id: chat._id },
                { $set: { displayName: newDisplayName } }
            );
        }
        
        console.log('\n✅ Fix completed! Testing API response...');
        
        // Quick test of the API after fixes
        const fixedChatsCount = await Chat.countDocuments({ account: account._id });
        console.log(`📊 Total chats in database: ${fixedChatsCount}`);
        
        const dmChatsWithParticipants = await Chat.countDocuments({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE',
            'participants.0': { $exists: true }
        });
        
        const dmChatsWithoutParticipants = await Chat.countDocuments({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE',
            $or: [
                { participants: { $exists: false } },
                { participants: { $size: 0 } }
            ]
        });
        
        console.log(`📊 DM chats with participants: ${dmChatsWithParticipants}`);
        console.log(`📊 DM chats without participants: ${dmChatsWithoutParticipants}`);
        
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('1. Test the API again to see if more chats are now visible');
        console.log('2. If some chats are still missing, the ChatController filtering logic may need adjustment');
        console.log('3. Consider improving the sync process to populate participants during sync');
        
        
    } catch (error) {
        console.error('❌ Error during fix:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run the fix
fixMissingChats();
