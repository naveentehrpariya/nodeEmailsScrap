require('dotenv').config();
const { MongoClient } = require('mongodb');

async function updateUserNames() {
    const client = new MongoClient(process.env.DB_URL_OFFICE);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Updating UserMapping entries with proper human names...');
        
        // First, let's see which UserMapping entries have synthetic names that need fixing
        const syntheticUsers = await db.collection('usermappings').find({
            displayName: /^User \d+/
        }).toArray();
        
        console.log(`📊 Found ${syntheticUsers.length} users with synthetic names:`);
        syntheticUsers.forEach(user => {
            console.log(`  - ${user.displayName} | ${user.email} | ${user.userId}`);
        });
        
        // Now let's see the good mappings that have real names
        const goodMappings = await db.collection('usermappings').find({
            displayName: { $not: /^User \d+/ },
            email: { $regex: '^[a-zA-Z].*@crossmilescarrier.com$' } // Real emails, not user-* ones
        }).toArray();
        
        console.log(`\n✅ Found ${goodMappings.length} users with proper names:`);
        goodMappings.forEach(user => {
            console.log(`  - ${user.displayName} | ${user.email} | ${user.userId} | confidence: ${user.confidence}`);
        });
        
        // For the specific user IDs that showed up in our chat test, let's try to find matches
        const problematicUserIds = [
            'users/115048080534626721571',
            'users/104329836262309309664', 
            'users/103074035611191657205'
        ];
        
        let updatedCount = 0;
        
        for (const userId of problematicUserIds) {
            console.log(`\n🔍 Looking for better name for ${userId}...`);
            
            const syntheticEntry = await db.collection('usermappings').findOne({ userId });
            if (!syntheticEntry) {
                console.log(`  ❌ No entry found for ${userId}`);
                continue;
            }
            
            console.log(`  Current: ${syntheticEntry.displayName} | ${syntheticEntry.email}`);
            
            // Strategy 1: Look for the same user with a different userId format
            const numericId = userId.replace('users/', '');
            const altEntry = await db.collection('usermappings').findOne({
                userId: numericId,
                displayName: { $not: /^User \d+/ }
            });
            
            if (altEntry) {
                console.log(`  ✅ Found alternative entry: ${altEntry.displayName} | ${altEntry.email}`);
                
                // Update the synthetic entry with the real name
                await db.collection('usermappings').updateOne(
                    { userId: userId },
                    { 
                        $set: {
                            displayName: altEntry.displayName,
                            email: altEntry.email,
                            confidence: Math.max(syntheticEntry.confidence || 0, altEntry.confidence || 0),
                            resolvedBy: 'name_merge_fix',
                            name: altEntry.name || altEntry.displayName
                        }
                    }
                );
                updatedCount++;
                console.log(`  🔄 Updated ${userId} -> ${altEntry.displayName}`);
                continue;
            }
            
            // Strategy 2: If the email looks like user-123@domain, try to find a real person
            // with that numeric ID in their email or userId
            if (syntheticEntry.email && syntheticEntry.email.includes('user-')) {
                const numericPart = syntheticEntry.email.match(/user-(\d+)/);
                if (numericPart) {
                    const searchNum = numericPart[1];
                    
                    // Look for any user with this number in their userId or email
                    const potentialMatch = await db.collection('usermappings').findOne({
                        $or: [
                            { userId: { $regex: searchNum } },
                            { email: { $regex: searchNum } }
                        ],
                        displayName: { $not: /^User \d+/ },
                        email: { $regex: '^[a-zA-Z].*@crossmilescarrier.com$' }
                    });
                    
                    if (potentialMatch) {
                        console.log(`  ✅ Found potential match by ID: ${potentialMatch.displayName} | ${potentialMatch.email}`);
                        
                        // Update with the matched name
                        await db.collection('usermappings').updateOne(
                            { userId: userId },
                            { 
                                $set: {
                                    displayName: potentialMatch.displayName,
                                    confidence: Math.max(syntheticEntry.confidence || 0, 80), // Moderate confidence
                                    resolvedBy: 'id_pattern_match',
                                    name: potentialMatch.name || potentialMatch.displayName
                                }
                            }
                        );
                        updatedCount++;
                        console.log(`  🔄 Updated ${userId} -> ${potentialMatch.displayName}`);
                        continue;
                    }
                }
            }
            
            // Strategy 3: Try to create a reasonable name from the numeric ID
            // by looking for a similar pattern in the good mappings
            const shortId = userId.replace('users/', '').substring(0, 8);
            
            // Just improve the display format
            await db.collection('usermappings').updateOne(
                { userId: userId },
                { 
                    $set: {
                        displayName: `Contact ${shortId}`,
                        resolvedBy: 'improved_fallback',
                        confidence: Math.max(syntheticEntry.confidence || 0, 30)
                    }
                }
            );
            updatedCount++;
            console.log(`  🔧 Improved fallback name: ${userId} -> Contact ${shortId}`);
        }
        
        console.log(`\n🎉 Updated ${updatedCount} user names!`);
        
        // Show the updated entries
        console.log('\n📋 Updated UserMapping entries:');
        for (const userId of problematicUserIds) {
            const updated = await db.collection('usermappings').findOne({ userId });
            if (updated) {
                console.log(`  - ${updated.displayName} | ${updated.email} | confidence: ${updated.confidence}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

updateUserNames();
