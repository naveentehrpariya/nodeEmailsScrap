const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

require('dotenv').config();
const MONGODB_URI = process.env.DB_URL_OFFICE;

async function comprehensiveChatFix() {
    console.log('🔧 COMPREHENSIVE CHAT FIX');
    console.log('==========================');
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        const userMappings = await UserMapping.find({}).lean();
        
        console.log(`👤 Account: ${account.email}`);
        console.log(`👥 UserMappings available: ${userMappings.length}`);
        
        // Create a lookup map for faster access
        const userLookup = {};
        userMappings.forEach(user => {
            userLookup[user.userId] = user;
            userLookup[user.email] = user;
        });
        
        // Get all chats
        const chats = await Chat.find({ account: account._id }).lean();
        console.log(`\n📊 Total chats: ${chats.length}`);
        
        const dmChats = chats.filter(chat => chat.spaceType === 'DIRECT_MESSAGE');
        console.log(`📊 DM chats: ${dmChats.length}`);
        
        let fixedCount = 0;
        
        for (const chat of dmChats) {
            console.log(`\n🔍 Analyzing: ${chat.spaceId} - "${chat.displayName}"`);
            console.log(`   Current participants: ${chat.participants ? chat.participants.length : 0}`);
            
            let needsUpdate = false;
            let updatedParticipants = [...(chat.participants || [])];
            let updatedDisplayName = chat.displayName;
            
            // Check if we need to improve participants
            if (!chat.participants || chat.participants.length === 0) {
                console.log('   ⚠️ No participants found, adding from message analysis');
                needsUpdate = true;
                
                // Add participants from message analysis
                if (chat.messages && chat.messages.length > 0) {
                    const senders = {};
                    chat.messages.forEach(msg => {
                        if (msg.senderId && msg.senderEmail && msg.senderEmail !== account.email) {
                            senders[msg.senderId] = {
                                email: msg.senderEmail,
                                displayName: msg.senderDisplayName || msg.senderEmail.split('@')[0],
                                userId: msg.senderId
                            };
                        }
                    });
                    
                    Object.values(senders).forEach(sender => {
                        updatedParticipants.push({
                            userId: sender.userId,
                            email: sender.email,
                            displayName: sender.displayName
                        });
                    });
                }
            }
            
            // Enhance participants with UserMapping data
            const enhancedParticipants = updatedParticipants.map(participant => {
                let enhanced = { ...participant };
                
                // Try to find better info from UserMapping
                const mappingByUserId = userLookup[participant.userId];
                const mappingByEmail = userLookup[participant.email];
                const mapping = mappingByUserId || mappingByEmail;
                
                if (mapping && mapping.displayName && mapping.displayName !== participant.displayName) {
                    console.log(`   📈 Enhancing participant: "${participant.displayName}" -> "${mapping.displayName}"`);
                    enhanced.displayName = mapping.displayName;
                    enhanced.email = mapping.email;
                    needsUpdate = true;
                }
                
                return enhanced;
            });
            
            // Improve display name based on best participant info
            if (enhancedParticipants.length > 0) {
                const otherParticipant = enhancedParticipants.find(p => p.email !== account.email);
                if (otherParticipant && (
                    !updatedDisplayName || 
                    updatedDisplayName.startsWith('(Direct Message)') || 
                    updatedDisplayName.startsWith('spaces/') ||
                    updatedDisplayName.startsWith('Chat Space')
                )) {
                    updatedDisplayName = otherParticipant.displayName || otherParticipant.email.split('@')[0];
                    console.log(`   🏷️ Updating display name: "${chat.displayName}" -> "${updatedDisplayName}"`);
                    needsUpdate = true;
                }
            }
            
            // Apply updates if needed
            if (needsUpdate) {
                console.log(`   ✅ Updating chat with ${enhancedParticipants.length} participants`);
                
                const updateResult = await Chat.updateOne(
                    { _id: chat._id },
                    { 
                        $set: { 
                            participants: enhancedParticipants,
                            displayName: updatedDisplayName
                        }
                    }
                );
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`   ✅ Successfully updated chat`);
                    fixedCount++;
                } else {
                    console.log(`   ⚠️ Update failed`);
                }
            } else {
                console.log(`   ℹ️ Chat looks good, no updates needed`);
            }
            
            // Log final state for verification
            const finalParticipants = enhancedParticipants.filter(p => p.email !== account.email);
            finalParticipants.forEach((p, i) => {
                console.log(`   👥 Participant ${i+1}: ${p.displayName} (${p.email})`);
            });
        }
        
        console.log(`\n✅ Fix completed! Updated ${fixedCount} chats`);
        
        // Verify the final state
        console.log(`\n📊 FINAL VERIFICATION`);
        console.log(`=====================`);
        
        const finalChats = await Chat.find({ 
            account: account._id, 
            spaceType: 'DIRECT_MESSAGE' 
        }).select('spaceId displayName participants').lean();
        
        console.log(`Final DM chats: ${finalChats.length}`);
        finalChats.forEach((chat, i) => {
            const otherParticipant = chat.participants?.find(p => p.email !== account.email);
            console.log(`  ${i+1}. "${chat.displayName}" - ${otherParticipant ? otherParticipant.displayName : 'No participant'} (${chat.spaceId})`);
        });
        
        // Test what the API would return
        console.log(`\n🧪 SIMULATING API RESPONSE`);
        console.log(`==========================`);
        
        let apiChatsCount = 0;
        const apiChats = [];
        
        for (const chat of finalChats) {
            if (chat.participants && chat.participants.length > 0) {
                const nonCurrentUserParticipants = chat.participants.filter(p => 
                    p.email !== account.email && p.email !== `${account.email}`
                );
                
                if (nonCurrentUserParticipants.length > 0) {
                    const participant = nonCurrentUserParticipants[0];
                    apiChats.push({
                        spaceId: chat.spaceId,
                        displayName: chat.displayName,
                        participantName: participant.displayName,
                        participantEmail: participant.email
                    });
                    apiChatsCount++;
                }
            }
        }
        
        console.log(`API would return ${apiChatsCount} DM chats:`);
        apiChats.forEach((chat, i) => {
            console.log(`  ${i+1}. "${chat.displayName}" - ${chat.participantName} (${chat.participantEmail})`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

comprehensiveChatFix();
