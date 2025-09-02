const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

require('dotenv').config();
mongoose.connect(process.env.DB_URL_OFFICE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

async function debugAccounts() {
    try {
        console.log('🔍 DEBUG: Checking database state...');
        
        // Find all accounts
        const accounts = await Account.find({}).lean();
        console.log(`📊 Total accounts: ${accounts.length}`);
        
        for (const account of accounts) {
            console.log(`\n👤 Account: ${account._id}`);
            console.log(`   Email: ${account.email}`);
            console.log(`   Name: ${account.name || 'N/A'}`);
            console.log(`   Created: ${account.createdAt}`);
            console.log(`   Last Chat Sync: ${account.lastChatSync || 'Never'}`);
            
            // Count chats for this account
            const chatCount = await Chat.countDocuments({ account: account._id });
            console.log(`   Chats: ${chatCount}`);
        }
        
        // Check user mappings
        const mappingCount = await UserMapping.countDocuments({});
        console.log(`\n📋 Total user mappings: ${mappingCount}`);
        
        // Show first few mappings
        const sampleMappings = await UserMapping.find({}).limit(5).lean();
        for (const mapping of sampleMappings) {
            console.log(`   ${mapping.userId} -> ${mapping.displayName} (${mapping.email})`);
        }
        
        // Check chats total
        const totalChats = await Chat.countDocuments({});
        console.log(`\n💬 Total chats: ${totalChats}`);
        
        if (totalChats > 0) {
            console.log('\n📝 Sample chats:');
            const sampleChats = await Chat.find({}).limit(3).lean();
            for (const chat of sampleChats) {
                console.log(`   ${chat.spaceId} (${chat.spaceType}) - ${chat.messageCount} messages`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

debugAccounts();
