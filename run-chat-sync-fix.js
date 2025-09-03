require('dotenv').config();
const mongoose = require('mongoose');
const OptimizedChatSyncService = require('./services/optimizedChatSyncService');
const Account = require('./db/Account');

async function runChatSyncFix() {
    try {
        console.log('🚀 RUNNING ENHANCED CHAT SYNC FIX');
        console.log('=' .repeat(50));
        
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to database');
        
        // Get all accounts
        const accounts = await Account.find({ 
            deletedAt: { $exists: false }
        });
        
        console.log(`📧 Found ${accounts.length} accounts to sync`);
        
        if (accounts.length === 0) {
            console.log('⚠️ No accounts found to sync');
            return;
        }
        
        // Run the optimized sync service
        console.log('🔄 Starting optimized chat sync...');
        const results = await OptimizedChatSyncService.syncAllChats();
        
        console.log('\n🎉 SYNC COMPLETED!');
        console.log('=' .repeat(30));
        
        let totalChats = 0;
        let totalMessages = 0;
        let successCount = 0;
        let errorCount = 0;
        
        results.forEach(result => {
            if (result.error) {
                console.log(`❌ ${result.email}: ${result.error}`);
                errorCount++;
            } else {
                console.log(`✅ ${result.email}: ${result.syncedChats} chats, ${result.syncedMessages} messages (${result.duration}s)`);
                totalChats += result.syncedChats;
                totalMessages += result.syncedMessages;
                successCount++;
            }
        });
        
        console.log('\n📊 SUMMARY:');
        console.log(`  Successful accounts: ${successCount}/${accounts.length}`);
        console.log(`  Total chats synced: ${totalChats}`);
        console.log(`  Total messages synced: ${totalMessages}`);
        console.log(`  Errors: ${errorCount}`);
        
        if (successCount === accounts.length) {
            console.log('\n🎉 All accounts synced successfully!');
            console.log('💡 Chat participants should now display proper names instead of user IDs');
            console.log('💡 Missing chats should have been recovered');
        } else {
            console.log('\n⚠️ Some accounts had sync issues. Check the error messages above.');
        }
        
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
        
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('Failed to disconnect:', disconnectError.message);
        }
        
        process.exit(1);
    }
}

// Run if this script is executed directly
if (require.main === module) {
    runChatSyncFix();
}

module.exports = runChatSyncFix;
