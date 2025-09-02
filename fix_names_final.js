const mongoose = require('mongoose');
require('dotenv').config();

// Define schemas inline
const chatSchema = new mongoose.Schema({}, { strict: false });
const accountSchema = new mongoose.Schema({}, { strict: false });

const Chat = mongoose.model('Chat', chatSchema);
const Account = mongoose.model('Account', accountSchema);

async function fixNamesFinal() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        console.log('\n=== FIXING ALL CHAT DISPLAY NAMES DEFINITIVELY ===');
        
        const accounts = await Account.find({}).lean();
        const naveenAccount = accounts.find(acc => acc.email === 'naveendev@crossmilescarrier.com');
        
        if (!naveenAccount) {
            console.log('❌ Naveen account not found');
            return;
        }
        
        console.log(`Working with Naveen account: ${naveenAccount._id}`);
        
        // Define the specific fixes needed
        const chatFixes = [
            {
                spaceId: 'spaces/w9y_pCAAAAE',
                newDisplayName: 'Dispatch',
                reason: 'This is the chat with dispatch@crossmilescarrier.com'
            },
            {
                spaceId: 'spaces/zJfRaCAAAAE', 
                newDisplayName: 'Jatin',
                reason: 'This is the chat with Jatin (users/115048080534626721571)'
            },
            {
                spaceId: 'spaces/oSpG6CAAAAE',
                newDisplayName: 'User 10432983',
                reason: 'This is the chat with User 10432983'
            },
            {
                spaceId: 'spaces/ht2eaCAAAAE',
                newDisplayName: 'Google Drive Bot',
                reason: 'This is the Google Drive system messages chat'
            }
        ];
        
        console.log('\n=== APPLYING FIXES ===');
        
        for (const fix of chatFixes) {
            console.log(`\nFixing ${fix.spaceId}:`);
            console.log(`  Setting display name to: "${fix.newDisplayName}"`);
            console.log(`  Reason: ${fix.reason}`);
            
            const updateResult = await Chat.updateOne(
                { 
                    account: naveenAccount._id,
                    spaceId: fix.spaceId,
                    spaceType: 'DIRECT_MESSAGE'
                },
                {
                    $set: {
                        displayName: fix.newDisplayName
                    }
                }
            );
            
            if (updateResult.matchedCount > 0) {
                console.log(`  ✅ Updated ${updateResult.modifiedCount} chat(s)`);
            } else {
                console.log(`  ❌ No matching chat found for ${fix.spaceId}`);
            }
        }
        
        // Also add participants to make relationships clear
        console.log('\n=== ADDING PARTICIPANTS ===');
        
        const participantUpdates = [
            {
                spaceId: 'spaces/w9y_pCAAAAE',
                participants: [
                    {
                        userId: 'users/108506371856200018714',
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'Naveen'
                    },
                    {
                        userId: 'users/105597362485153931945',
                        email: 'dispatch@crossmilescarrier.com', 
                        displayName: 'Dispatch'
                    }
                ]
            },
            {
                spaceId: 'spaces/zJfRaCAAAAE',
                participants: [
                    {
                        userId: 'users/108506371856200018714',
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'Naveen'
                    },
                    {
                        userId: 'users/115048080534626721571',
                        email: 'user-115048080534626721571@crossmilescarrier.com',
                        displayName: 'Jatin'
                    }
                ]
            },
            {
                spaceId: 'spaces/oSpG6CAAAAE',
                participants: [
                    {
                        userId: 'users/108506371856200018714',
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'Naveen'
                    },
                    {
                        userId: 'users/104329836262309309664',
                        email: 'user-104329836262309309664@crossmilescarrier.com',
                        displayName: 'User 10432983'
                    }
                ]
            },
            {
                spaceId: 'spaces/ht2eaCAAAAE',
                participants: [
                    {
                        userId: 'users/108506371856200018714',
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'Naveen'
                    },
                    {
                        userId: 'users/103074035611191657205',
                        email: 'user-103074035611191657205@crossmilescarrier.com',
                        displayName: 'Google Drive Bot'
                    }
                ]
            }
        ];
        
        for (const update of participantUpdates) {
            await Chat.updateOne(
                { 
                    account: naveenAccount._id,
                    spaceId: update.spaceId
                },
                {
                    $set: {
                        participants: update.participants
                    }
                }
            );
        }
        
        console.log('✅ Added participants to all chats');
        
        console.log('\n=== VERIFICATION ===');
        
        // Verify the changes
        const updatedChats = await Chat.find({ 
            account: naveenAccount._id,
            spaceType: 'DIRECT_MESSAGE'
        }).lean();
        
        console.log('Updated chat display names:');
        updatedChats.forEach((chat, index) => {
            console.log(`  ${index + 1}. "${chat.displayName}" (${chat.spaceId})`);
            if (chat.participants && chat.participants.length > 0) {
                console.log(`     Participants: ${chat.participants.map(p => p.displayName).join(', ')}`);
            }
        });
        
        console.log('\n=== EXPECTED FRONTEND RESULT ===');
        console.log('✅ Naveen should now see these chats:');
        console.log('  - "Dispatch" (chat with dispatch@crossmilescarrier.com)');
        console.log('  - "Jatin" (chat with external user Jatin)');
        console.log('  - "User 10432983" (chat with generic user)');
        console.log('  - "Google Drive Bot" (system messages)');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

fixNamesFinal();
