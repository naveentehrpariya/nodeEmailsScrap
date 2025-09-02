require('dotenv').config();
const { MongoClient } = require('mongodb');

async function improveChatNames() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Improving chat display names with better context...');
        
        // Get chats that need better names
        const chats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE',
            'participants.displayName': { $regex: '^Contact ' }
        }).toArray();
        
        console.log(`Found ${chats.length} chats to improve`);
        
        let improvedCount = 0;
        
        for (const chat of chats) {
            console.log(`\nImproving chat: ${chat.displayName}`);
            
            let betterName = null;
            let chatUpdated = false;
            
            // Strategy 1: Analyze message content to infer the service/person type
            if (chat.messages && chat.messages.length > 0) {
                const messages = chat.messages;
                const messageTexts = messages.map(m => m.text || '').join(' ').toLowerCase();
                
                // Look for service indicators
                if (messageTexts.includes('google drive')) {
                    betterName = 'Google Drive Bot';
                } else if (messageTexts.includes('calendar')) {
                    betterName = 'Google Calendar';
                } else if (messageTexts.includes('welcome to') && messageTexts.includes('app')) {
                    betterName = 'Google Services';
                } else if (messageTexts.includes('notification') || messageTexts.includes('alert')) {
                    betterName = 'System Notifications';
                } else {
                    // Try to extract a meaningful name from the first few words
                    const firstMessage = messages.find(m => !m.isSentByCurrentUser && m.text);
                    if (firstMessage && firstMessage.text) {
                        const text = firstMessage.text.trim();
                        // Look for patterns like "Hi, I'm..." or "This is..."
                        const namePatterns = [
                            /Hi,?\\s+I'?m\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)/i,
                            /This is\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)/i,
                            /My name is\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)/i
                        ];
                        
                        for (const pattern of namePatterns) {
                            const match = text.match(pattern);
                            if (match && match[1]) {
                                betterName = match[1];
                                break;
                            }
                        }
                    }
                }
            }
            
            // Strategy 2: Try to find a real user mapping that might match
            const contactParticipant = chat.participants.find(p => p.displayName?.startsWith('Contact '));
            if (contactParticipant && !betterName) {
                const userId = contactParticipant.userId;
                
                // Look for any real person who might have sent messages with similar patterns
                const realUsers = await db.collection('usermappings').find({
                    displayName: { $not: /^(User|Contact) / },
                    confidence: { $gte: 90 }
                }).toArray();
                
                // For now, let's create a better contextual name based on the user ID pattern
                const numericId = userId?.replace('users/', '') || 'unknown';
                const shortId = numericId.substring(0, 8);
                
                if (!betterName) {
                    betterName = `External User ${shortId}`;
                }
            }
            
            // Strategy 3: Fallback - use a more descriptive name based on context
            if (!betterName) {
                const contactParticipant = chat.participants.find(p => p.displayName?.startsWith('Contact '));
                if (contactParticipant) {
                    const shortId = contactParticipant.displayName.replace('Contact ', '');
                    betterName = `External Contact ${shortId}`;
                }
            }
            
            // Update the participant display name if we found a better one
            if (betterName && contactParticipant) {
                console.log(`  Updating: ${contactParticipant.displayName} -> ${betterName}`);
                
                // Update in the chat participants array
                for (let participant of chat.participants) {
                    if (participant.displayName?.startsWith('Contact ')) {
                        participant.displayName = betterName;
                        chatUpdated = true;
                    }
                }
                
                // Also update in UserMapping if it exists
                if (contactParticipant.userId) {
                    await db.collection('usermappings').updateOne(
                        { userId: contactParticipant.userId },
                        { 
                            $set: { 
                                displayName: betterName,
                                resolvedBy: 'context_analysis',
                                confidence: 60 // Moderate confidence for context-based names
                            }
                        }
                    );
                }
                
                improvedCount++;
            }
            
            // Update the chat if we made changes
            if (chatUpdated) {
                await db.collection('chats').updateOne(
                    { _id: chat._id },
                    { 
                        $set: { 
                            participants: chat.participants,
                            updatedAt: new Date()
                        } 
                    }
                );
                console.log(`  ✅ Updated chat participants`);
            }
        }
        
        console.log(`\n🎉 Improved ${improvedCount} chat names!`);
        
        // Show the results
        const updatedChats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        console.log('\n📋 Updated chat names:');
        updatedChats.forEach((chat, i) => {
            const otherParticipant = chat.participants?.find(p => p.email !== 'naveendev@crossmilescarrier.com');
            if (otherParticipant) {
                console.log(`  ${i + 1}. ${otherParticipant.displayName}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

improveChatNames();
