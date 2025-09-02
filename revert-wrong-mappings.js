require('dotenv').config();
const { MongoClient } = require('mongodb');

async function revertWrongMappings() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔄 Reverting incorrect manual mappings...');
        
        // The user IDs that were incorrectly mapped
        const wronglyMappedIds = [
            'users/115048080534626721571',
            'users/104329836262309309664',
            'users/103074035611191657205'
        ];
        
        console.log('Reverting UserMapping entries...');
        
        for (const userId of wronglyMappedIds) {
            const numericId = userId.replace('users/', '');
            
            // Revert to a neutral name based on the ID
            const neutralName = `External User ${numericId.substring(0, 8)}`;
            const neutralEmail = `user-${numericId}@crossmilescarrier.com`;
            
            console.log(`  Reverting ${userId} -> ${neutralName}`);
            
            // Update UserMapping
            await db.collection('usermappings').updateOne(
                { userId: userId },
                { 
                    $set: {
                        displayName: neutralName,
                        email: neutralEmail,
                        confidence: 40, // Low confidence for unknown users
                        resolvedBy: 'reverted_incorrect_mapping'
                    },
                    $unset: {
                        linkedToEmployee: 1 // Remove incorrect link
                    }
                }
            );
            
            // Update chat participants
            await db.collection('chats').updateMany(
                { 'participants.userId': userId },
                { 
                    $set: {
                        'participants.$.displayName': neutralName,
                        'participants.$.email': neutralEmail
                    }
                }
            );
        }
        
        console.log('\n✅ Reverted incorrect mappings');
        
        // Now let's try to find the REAL correct mappings by analyzing the actual chat messages
        console.log('\n🔍 Analyzing chat messages to find correct participants...');
        
        const chats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        for (const chat of chats) {
            console.log(`\nChat: ${chat.displayName || '(Direct Message)'}`);
            console.log(`  Space ID: ${chat.spaceId}`);
            console.log(`  Participants: ${chat.participants?.length || 0}`);
            
            if (chat.participants) {
                chat.participants.forEach(p => {
                    console.log(`    - ${p.displayName} | ${p.email} | ${p.userId}`);
                });
            }
            
            if (chat.messages && chat.messages.length > 0) {
                console.log(`  Messages: ${chat.messages.length}`);
                
                // Show message senders to understand who's actually in this conversation
                const senders = new Map();
                chat.messages.forEach(msg => {
                    const key = `${msg.senderDisplayName} (${msg.senderEmail})`;
                    senders.set(key, (senders.get(key) || 0) + 1);
                });
                
                console.log(`  Message senders:`);
                for (const [sender, count] of senders.entries()) {
                    console.log(`    - ${sender}: ${count} messages`);
                }
            }
        }
        
        console.log('\n📋 Current state after revert:');
        const verifyChats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        verifyChats.forEach((chat, i) => {
            const otherParticipant = chat.participants?.find(p => p.email !== 'naveendev@crossmilescarrier.com');
            if (otherParticipant) {
                console.log(`  ${i + 1}. ${otherParticipant.displayName}`);
            }
        });
        
        console.log('\n💡 To fix this properly, we need to:');
        console.log('1. Identify which real person each external user ID actually represents');
        console.log('2. Look at message content, timing, or other clues');
        console.log('3. Only map when we have clear evidence of the correct identity');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

revertWrongMappings();
