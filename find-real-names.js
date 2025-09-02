require('dotenv').config();
const { MongoClient } = require('mongodb');

async function findRealNames() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔍 Trying to find real names for external users...');
        
        // Get the problematic user IDs
        const externalUserIds = [
            'users/115048080534626721571',
            'users/104329836262309309664', 
            'users/103074035611191657205'
        ];
        
        // Get all real employee names for reference
        const realEmployees = await db.collection('usermappings').find({
            displayName: { $not: /^(User|Contact|External) / },
            confidence: { $gte: 90 },
            email: { $regex: '@crossmilescarrier.com$' }
        }).toArray();
        
        console.log(`Found ${realEmployees.length} real employees in the system:`);
        realEmployees.forEach(emp => {
            console.log(`  - ${emp.displayName} | ${emp.email} | ${emp.userId}`);
        });
        
        console.log('\n🔍 Analyzing external users...');
        
        for (const userId of externalUserIds) {
            console.log(`\nAnalyzing ${userId}:`);
            
            const numericId = userId.replace('users/', '');
            
            // Strategy 1: Look for partial matches in existing mappings
            const partialMatches = await db.collection('usermappings').find({
                $or: [
                    { userId: { $regex: numericId.substring(0, 10) } },
                    { email: { $regex: numericId.substring(0, 10) } }
                ],
                displayName: { $not: /^(User|Contact|External) / }
            }).toArray();
            
            if (partialMatches.length > 0) {
                console.log(`  📋 Found partial matches:`, partialMatches.map(m => m.displayName));
            }
            
            // Strategy 2: Check chat messages involving this user for name clues
            const chatsWithThisUser = await db.collection('chats').find({
                'messages.senderId': userId
            }).toArray();
            
            if (chatsWithThisUser.length > 0) {
                console.log(`  💬 Found in ${chatsWithThisUser.length} chats`);
                
                // Look for messages from this user that might contain their name
                for (const chat of chatsWithThisUser) {
                    const userMessages = chat.messages.filter(m => m.senderId === userId);
                    
                    for (const msg of userMessages) {
                        // Look for signature patterns
                        const text = msg.text || '';
                        const signaturePatterns = [
                            /Best regards,\\s*([A-Z][a-z]+ [A-Z][a-z]+)/i,
                            /Thanks,\\s*([A-Z][a-z]+ [A-Z][a-z]+)/i,
                            /Sincerely,\\s*([A-Z][a-z]+ [A-Z][a-z]+)/i,
                            /-\\s*([A-Z][a-z]+ [A-Z][a-z]+)$/i
                        ];
                        
                        for (const pattern of signaturePatterns) {
                            const match = text.match(pattern);
                            if (match && match[1]) {
                                console.log(`    📝 Found potential signature: "${match[1]}"`);
                            }
                        }
                    }
                }
            }
            
            // Strategy 3: Manual mapping based on known patterns (if you know the real names)
            // This is where you could manually specify the mappings if you know them
            const knownMappings = {
                '115048080534626721571': 'narender',  // If you know this is narender
                '104329836262309309664': 'dispatch',   // If you know this is dispatch  
                '103074035611191657205': 'Google Drive Bot' // This is clearly a bot
            };
            
            if (knownMappings[numericId]) {
                const realName = knownMappings[numericId];
                console.log(`  🎯 Manual mapping: ${userId} -> ${realName}`);
                
                // Look for this real name in the employees list
                const matchingEmployee = realEmployees.find(emp => 
                    emp.displayName.toLowerCase().includes(realName.toLowerCase()) ||
                    emp.email.toLowerCase().includes(realName.toLowerCase())
                );
                
                if (matchingEmployee) {
                    console.log(`    ✅ Found matching employee: ${matchingEmployee.displayName} (${matchingEmployee.email})`);
                    
                    // Update the UserMapping and chat participants
                    await db.collection('usermappings').updateOne(
                        { userId: userId },
                        { 
                            $set: {
                                displayName: matchingEmployee.displayName,
                                email: matchingEmployee.email,
                                confidence: 95,
                                resolvedBy: 'manual_mapping',
                                linkedToEmployee: matchingEmployee._id
                            }
                        }
                    );
                    
                    // Update chat participants
                    await db.collection('chats').updateMany(
                        { 'participants.userId': userId },
                        { 
                            $set: {
                                'participants.$.displayName': matchingEmployee.displayName,
                                'participants.$.email': matchingEmployee.email
                            }
                        }
                    );
                    
                    console.log(`    🔄 Updated mappings and chat participants`);
                }
            }
        }
        
        console.log('\n📋 Final verification...');
        const updatedChats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        console.log('Current chat participant names:');
        updatedChats.forEach((chat, i) => {
            const otherParticipant = chat.participants?.find(p => p.email !== 'naveendev@crossmilescarrier.com');
            if (otherParticipant) {
                console.log(`  ${i + 1}. ${otherParticipant.displayName} (${otherParticipant.userId})`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

findRealNames();
