const mongoose = require('mongoose');
require('dotenv').config();

// Define schemas inline
const chatSchema = new mongoose.Schema({}, { strict: false });
const accountSchema = new mongoose.Schema({}, { strict: false });
const userMappingSchema = new mongoose.Schema({}, { strict: false });

const Chat = mongoose.model('Chat', chatSchema);
const Account = mongoose.model('Account', accountSchema);
const UserMapping = mongoose.model('UserMapping', userMappingSchema);

async function checkCurrentState() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('Connected to MongoDB');

        console.log('\n=== CURRENT STATE VERIFICATION ===');
        
        const accounts = await Account.find({}).lean();
        const naveenAccount = accounts.find(acc => acc.email === 'naveendev@crossmilescarrier.com');
        
        if (!naveenAccount) {
            console.log('❌ Naveen account not found');
            return;
        }
        
        console.log(`✅ Found Naveen account: ${naveenAccount._id}`);
        
        // Get ALL chats for Naveen
        const allChats = await Chat.find({ account: naveenAccount._id }).lean();
        console.log(`\nFound ${allChats.length} total chats for Naveen:`);
        
        allChats.forEach((chat, index) => {
            console.log(`\n--- Chat ${index + 1} ---`);
            console.log(`Display Name: "${chat.displayName}"`);
            console.log(`Space ID: ${chat.spaceId}`);
            console.log(`Space Type: ${chat.spaceType}`);
            console.log(`Message Count: ${chat.messageCount}`);
            
            if (chat.participants && chat.participants.length > 0) {
                console.log(`Participants:`);
                chat.participants.forEach(p => {
                    console.log(`  - ${p.displayName} (${p.email})`);
                });
            }
            
            if (chat.messages && chat.messages.length > 0) {
                console.log(`Recent messages:`);
                chat.messages.slice(-3).forEach((msg, msgIndex) => {
                    console.log(`  ${msgIndex + 1}. "${msg.text}" from ${msg.senderDisplayName} (${msg.senderEmail})`);
                    console.log(`     Sender ID: ${msg.senderId}`);
                });
            }
        });

        console.log('\n=== CURRENT USER MAPPINGS ===');
        const userMappings = await UserMapping.find({}).lean();
        console.log(`Total user mappings: ${userMappings.length}`);
        
        // Show mappings that might be relevant
        const relevantMappings = userMappings.filter(mapping => 
            mapping.displayName === 'Jatin' ||
            mapping.displayName === 'Naveen' ||
            mapping.displayName === 'Dispatch' ||
            mapping.displayName === 'Google Drive Bot' ||
            mapping.email === 'naveendev@crossmilescarrier.com' ||
            mapping.email === 'dispatch@crossmilescarrier.com'
        );
        
        console.log(`\nRelevant user mappings (${relevantMappings.length}):`);
        relevantMappings.forEach(mapping => {
            console.log(`  ${mapping.userId} -> ${mapping.displayName} (${mapping.email})`);
            console.log(`    Resolved by: ${mapping.resolvedBy}, Confidence: ${mapping.confidence}`);
        });

        console.log('\n=== ANALYZING SPECIFIC PROBLEM ===');
        
        // Find chats that might still be showing wrong names
        const problemChats = allChats.filter(chat => 
            chat.displayName === 'Naveen' || 
            chat.displayName === '(Direct Message)' ||
            (chat.messages && chat.messages.some(msg => msg.senderDisplayName === 'Naveen' && msg.isExternal))
        );
        
        console.log(`Found ${problemChats.length} potentially problematic chats:`);
        problemChats.forEach((chat, index) => {
            console.log(`\nProblem Chat ${index + 1}:`);
            console.log(`  Display Name: "${chat.displayName}" (should show other person's name)`);
            console.log(`  Space ID: ${chat.spaceId}`);
            
            if (chat.messages) {
                const senderIds = [...new Set(chat.messages.map(msg => msg.senderId))];
                console.log(`  Unique sender IDs: ${senderIds.join(', ')}`);
                
                senderIds.forEach(senderId => {
                    const sampleMsg = chat.messages.find(msg => msg.senderId === senderId);
                    console.log(`    ${senderId}: ${sampleMsg.senderDisplayName} (${sampleMsg.senderEmail})`);
                });
            }
        });

        // Check if there are any API/frontend caching issues
        console.log('\n=== FRONTEND/API CACHE CHECK ===');
        console.log('If names still appear wrong in frontend, it might be:');
        console.log('1. Frontend caching - Try refreshing the browser');
        console.log('2. API response caching - Check if API is returning updated data');
        console.log('3. Component state caching - Check React component state');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkCurrentState();
