require('dotenv').config();
const { MongoClient } = require('mongodb');

async function fixMissingParticipants() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Fixing missing participants in DM chats...');
        
        // Get account
        const account = await db.collection('accounts').findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Account not found');
        }
        
        console.log(`✅ Found account: ${account._id}`);
        
        // Get all DM chats with missing participants
        const dmChats = await db.collection('chats').find({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE',
            $or: [
                { participants: { $size: 0 } },
                { participants: { $exists: false } }
            ]
        }).toArray();
        
        console.log(`🔍 Found ${dmChats.length} DM chats with missing participants`);
        
        let fixedCount = 0;
        
        for (const chat of dmChats) {
            console.log(`\\nAnalyzing chat: ${chat.displayName} (${chat.spaceId})`);
            
            let updatedParticipants = [];
            let chatNeedsUpdate = false;
            
            // Always add the current user as a participant
            updatedParticipants.push({
                userId: 'users/108506371856200018714', // naveendev's user ID
                email: 'naveendev@crossmilescarrier.com',
                displayName: 'naveendev'
            });
            
            // Analyze messages to find other participants
            if (chat.messages && chat.messages.length > 0) {
                console.log(`  Analyzing ${chat.messages.length} messages...`);
                
                // Find unique senders that are not the current user
                const otherSenders = new Map();
                
                chat.messages.forEach(msg => {
                    if (!msg.isSentByCurrentUser && msg.senderId && msg.senderId !== 'users/108506371856200018714') {
                        // This is a message from someone else
                        if (!otherSenders.has(msg.senderId)) {
                            otherSenders.set(msg.senderId, {
                                userId: msg.senderId,
                                email: msg.senderEmail || `user-${msg.senderId.replace('users/', '')}@crossmilescarrier.com`,
                                displayName: msg.senderDisplayName || `User ${msg.senderId.replace('users/', '').substring(0, 8)}`,
                                messageCount: 1
                            });
                        } else {
                            otherSenders.get(msg.senderId).messageCount++;
                        }
                    }
                });
                
                console.log(`  Found ${otherSenders.size} other participants from messages`);
                
                // Add other participants to the updated list
                otherSenders.forEach((senderInfo, senderId) => {
                    console.log(`    - ${senderInfo.displayName} (${senderInfo.email}) - ${senderInfo.messageCount} messages`);
                    updatedParticipants.push(senderInfo);
                });
                
                chatNeedsUpdate = true;
            }
            
            // If we still don't have other participants, this is a one-way conversation
            // Try to infer the recipient from the space ID or create a reasonable placeholder
            if (updatedParticipants.length === 1) {
                console.log('  This appears to be a one-way conversation');
                
                // Try to create a recipient based on space ID pattern or other clues
                const spaceIdShort = chat.spaceId.replace('spaces/', '').substring(0, 8);
                
                // Check if there are any external clues about who this conversation is with
                // For now, create a generic recipient
                updatedParticipants.push({
                    userId: `inferred_${spaceIdShort}`,
                    email: `recipient-${spaceIdShort}@crossmilescarrier.com`,
                    displayName: `Contact ${spaceIdShort}`
                });
                
                console.log(`  Created inferred recipient: Contact ${spaceIdShort}`);
                chatNeedsUpdate = true;
            }
            
            // Update the chat if we have new participants
            if (chatNeedsUpdate && updatedParticipants.length > 0) {
                await db.collection('chats').updateOne(
                    { _id: chat._id },
                    { 
                        $set: { 
                            participants: updatedParticipants,
                            updatedAt: new Date()
                        } 
                    }
                );
                
                console.log(`  ✅ Updated participants (${updatedParticipants.length} total)`);
                fixedCount++;
            }
        }
        
        console.log(`\\n🎉 Fixed participants for ${fixedCount} chats!`);
        
        // Verify the fix
        const verifyChats = await db.collection('chats').find({
            account: account._id,
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        console.log('\\n📋 Verification - DM chats now have:');
        verifyChats.forEach((chat, i) => {
            console.log(`  ${i + 1}. ${chat.displayName} - ${chat.participants?.length || 0} participants`);
            if (chat.participants && chat.participants.length > 0) {
                chat.participants.forEach(p => {
                    console.log(`     - ${p.displayName} (${p.email})`);
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

fixMissingParticipants();
