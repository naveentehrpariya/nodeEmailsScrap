require('dotenv').config();
const { MongoClient } = require('mongodb');

async function fixChatNames() {
    const client = new MongoClient(process.env.DB_URL_OFFICE);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Fixing chat participant names...');
        
        // Get account first
        const account = await db.collection('accounts').findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Account not found');
        }
        
        console.log(`✅ Found account: ${account._id}`);
        
        // Get all chats for this account
        const chats = await db.collection('chats').find({ account: account._id }).toArray();
        console.log(`📊 Found ${chats.length} total chats`);
        
        const dmChats = chats.filter(c => c.spaceType === 'DIRECT_MESSAGE');
        console.log(`💬 Found ${dmChats.length} DM chats`);
        
        let fixedCount = 0;
        
        for (const chat of dmChats) {
            console.log(`\n🔍 Analyzing chat: ${chat.displayName}`);
            console.log(`   Space ID: ${chat.spaceId}`);
            console.log(`   Participants: ${chat.participants.length}`);
            
            // For each participant, try to find a better name
            let chatNeedsUpdate = false;
            
            for (let i = 0; i < chat.participants.length; i++) {
                const participant = chat.participants[i];
                console.log(`   Participant ${i + 1}: ${participant.displayName} | ${participant.email}`);
                
                // Skip the current user
                if (participant.email === account.email) {
                    console.log(`     ⏭️  Skipping current user`);
                    continue;
                }
                
                // If this participant has a synthetic name like "User 12345", try to find a better one
                if (participant.displayName && participant.displayName.startsWith('User ')) {
                    console.log(`     🔍 Looking for better name for ${participant.displayName}...`);
                    
                    // Try to find a UserMapping entry with a real name for the same user ID
                    let betterMapping = null;
                    
                    if (participant.userId) {
                        // Look for any UserMapping with the same userId that has a real name
                        const alternatives = await db.collection('usermappings').find({
                            userId: { $in: [participant.userId, participant.userId.replace('users/', '')] }
                        }).toArray();
                        
                        console.log(`       Found ${alternatives.length} alternative mappings:`);
                        alternatives.forEach(alt => {
                            console.log(`         - ${alt.displayName} | ${alt.email} | confidence: ${alt.confidence} | resolvedBy: ${alt.resolvedBy}`);
                        });
                        
                        // Pick the best alternative (highest confidence, not a fallback name)
                        betterMapping = alternatives
                            .filter(alt => !alt.displayName.startsWith('User ') && alt.resolvedBy !== 'fallback')
                            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
                    }
                    
                    // Also try to find by looking at message senders in this chat
                    if (!betterMapping && chat.messages) {
                        console.log(`       Looking at message senders for clues...`);
                        
                        // Find messages from other participants
                        const otherSenders = chat.messages.filter(m => 
                            !m.isSentByCurrentUser && 
                            m.senderEmail && 
                            m.senderEmail !== account.email &&
                            !m.senderEmail.includes('user-') &&
                            m.senderEmail.includes('@crossmilescarrier.com')
                        );
                        
                        if (otherSenders.length > 0) {
                            const realEmails = [...new Set(otherSenders.map(m => m.senderEmail))];
                            console.log(`         Found real sender emails: ${realEmails.join(', ')}`);
                            
                            // For each real email, try to find a proper UserMapping
                            for (const email of realEmails) {
                                const realMapping = await db.collection('usermappings').findOne({
                                    email: email,
                                    resolvedBy: { $ne: 'fallback' }
                                });
                                
                                if (realMapping && !realMapping.displayName.startsWith('User ')) {
                                    console.log(`         ✅ Found real mapping: ${email} -> ${realMapping.displayName}`);
                                    betterMapping = realMapping;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // If we found a better mapping, update the participant
                    if (betterMapping) {
                        console.log(`       🔄 Updating participant: ${participant.displayName} -> ${betterMapping.displayName}`);
                        participant.displayName = betterMapping.displayName;
                        participant.email = betterMapping.email;
                        participant.userId = betterMapping.userId;
                        chatNeedsUpdate = true;
                        fixedCount++;
                    } else {
                        console.log(`       ❌ No better mapping found`);
                        
                        // Last resort: try to extract a real name from message sender display names
                        if (chat.messages) {
                            const realSenderNames = chat.messages
                                .filter(m => !m.isSentByCurrentUser && m.senderDisplayName && !m.senderDisplayName.startsWith('User '))
                                .map(m => m.senderDisplayName);
                            
                            if (realSenderNames.length > 0) {
                                const mostCommonName = realSenderNames.sort((a,b) =>
                                    realSenderNames.filter(name => name === b).length - realSenderNames.filter(name => name === a).length
                                )[0];
                                
                                console.log(`       🔧 Using message sender name: ${mostCommonName}`);
                                participant.displayName = mostCommonName;
                                chatNeedsUpdate = true;
                                fixedCount++;
                            }
                        }
                    }
                }
            }
            
            // Update the chat if needed
            if (chatNeedsUpdate) {
                await db.collection('chats').updateOne(
                    { _id: chat._id },
                    { $set: { participants: chat.participants } }
                );
                console.log(`   ✅ Updated chat participants`);
            }
        }
        
        console.log(`\n🎉 Fixed ${fixedCount} participant names!`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

fixChatNames();
