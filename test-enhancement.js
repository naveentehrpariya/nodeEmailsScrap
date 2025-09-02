require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/config');

// Load all models
require('./db/Account');
require('./db/Chat');
require('./db/UserMapping');

const chatSyncService = require('./services/chatSyncService');

async function testEnhancement() {
    try {
        console.log('🔌 Connecting to database...');
        await connectDB();
        
        console.log('🧪 Running user mapping enhancement test...');
        await chatSyncService.enhanceUserMappingsAcrossAccounts();
        
        console.log('✅ Enhancement test completed successfully');
        
        // Check results
        const UserMapping = require('./db/UserMapping');
        const Chat = require('./db/Chat');
        
        const mappings = await UserMapping.find({});
        console.log(`📊 Total user mappings: ${mappings.length}`);
        mappings.forEach(mapping => {
            console.log(`   ${mapping.userId}: ${mapping.displayName} (${mapping.email}) - ${mapping.resolvedBy}`);
        });
        
        const chats = await Chat.find({ spaceType: 'DIRECT_MESSAGE' }).select('displayName account messages.senderDisplayName');
        console.log(`💬 Direct message chats: ${chats.length}`);
        chats.forEach((chat, index) => {
            console.log(`   Chat ${index + 1}: "${chat.displayName}"`);
        });
        
        await mongoose.disconnect();
        
    } catch (error) {
        console.error('❌ Enhancement test failed:', error);
        process.exit(1);
    }
}

testEnhancement();
