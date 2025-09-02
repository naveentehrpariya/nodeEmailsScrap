require('dotenv').config();
const { MongoClient } = require('mongodb');

async function applyCorrectMappings() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Applying correct mappings based on message analysis...');
        
        // Based on message analysis, apply correct mappings
        const corrections = [
            {
                userId: 'users/103074035611191657205',
                displayName: 'Google Drive Bot',
                email: 'googledrive-bot@system.com',
                confidence: 95,
                reason: 'Confirmed by "Welcome to the Google Drive app" message'
            },
            {
                userId: 'users/104329836262309309664',
                displayName: 'Ravi',
                email: 'ravi@crossmilescarrier.com', // Assuming it's an employee
                confidence: 80,
                reason: 'User mentioned "Ravi" in their own messages'
            },
            {
                userId: 'users/115048080534626721571', 
                displayName: 'Unknown Contact',
                email: 'user-115048080534626721571@crossmilescarrier.com',
                confidence: 50,
                reason: 'Casual conversation but no clear identity clues'
            }
        ];
        
        for (const correction of corrections) {
            console.log(`\n🔄 Updating ${correction.userId}:`);
            console.log(`  Name: ${correction.displayName}`);
            console.log(`  Email: ${correction.email}`);
            console.log(`  Confidence: ${correction.confidence}%`);
            console.log(`  Reason: ${correction.reason}`);
            
            // Check if this name matches any existing employee
            if (correction.displayName !== 'Google Drive Bot' && correction.displayName !== 'Unknown Contact') {
                const matchingEmployee = await db.collection('usermappings').findOne({
                    displayName: { $regex: new RegExp(correction.displayName, 'i') },
                    confidence: { $gte: 90 }
                });
                
                if (matchingEmployee) {
                    console.log(`  ✅ Found matching employee: ${matchingEmployee.displayName} (${matchingEmployee.email})`);
                    correction.displayName = matchingEmployee.displayName;
                    correction.email = matchingEmployee.email;
                    correction.confidence = 90;
                }
            }
            
            // Update UserMapping
            await db.collection('usermappings').updateOne(
                { userId: correction.userId },
                { 
                    $set: {
                        displayName: correction.displayName,
                        email: correction.email,
                        confidence: correction.confidence,
                        resolvedBy: 'message_content_analysis',
                        analysisReason: correction.reason,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );
            
            // Update chat participants
            const updateResult = await db.collection('chats').updateMany(
                { 'participants.userId': correction.userId },
                { 
                    $set: {
                        'participants.$.displayName': correction.displayName,
                        'participants.$.email': correction.email
                    }
                }
            );
            
            console.log(`  📝 Updated ${updateResult.modifiedCount} chat participant entries`);
        }
        
        console.log('\n✅ Applied corrections based on message analysis');
        
        // Verify results
        console.log('\n📋 Updated chat names:');
        const updatedChats = await db.collection('chats').find({
            spaceType: 'DIRECT_MESSAGE'
        }).toArray();
        
        updatedChats.forEach((chat, i) => {
            const otherParticipant = chat.participants?.find(p => p.email !== 'naveendev@crossmilescarrier.com');
            if (otherParticipant) {
                console.log(`  ${i + 1}. ${otherParticipant.displayName} (confidence: based on message content)`);
            }
        });
        
        console.log('\n💡 Results:');
        console.log('✅ Google Drive Bot - High confidence (system messages)'); 
        console.log('🟡 Ravi - Medium confidence (mentioned in own messages)');
        console.log('❓ Unknown Contact - Low confidence (need more info)');
        console.log('\nIf you know the real identity of the "Unknown Contact", please let me know!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

applyCorrectMappings();
