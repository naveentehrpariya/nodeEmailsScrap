const mongoose = require('mongoose');
require('dotenv').config();

// Import the services
const originalSyncService = require('../services/chatSyncService');
const optimizedSyncService = require('../services/optimizedChatSyncService');
const Account = require('../db/Account');
const connectDB = require('../db/config');

// Connect to MongoDB using project's connection method
connectDB();

async function testSyncPerformance() {
    try {
        console.log('🧪 Starting sync performance test...\n');

        // Get a test account
        const account = await Account.findOne({ 
            deletedAt: { $exists: false }
        });
        if (!account) {
            console.error('❌ No active account found for testing');
            process.exit(1);
        }

        console.log(`📧 Testing with account: ${account.email}\n`);

        // Test original sync service
        console.log('🐢 Testing ORIGINAL sync service...');
        const originalStartTime = Date.now();
        
        try {
            const originalResult = await originalSyncService.syncAccountChats(account);
            const originalDuration = Date.now() - originalStartTime;
            
            console.log('✅ Original sync completed:');
            console.log(`   Duration: ${Math.round(originalDuration / 1000)}s`);
            console.log(`   Chats synced: ${originalResult.syncedChats}`);
            console.log(`   Messages synced: ${originalResult.syncedMessages}`);
            console.log(`   Total spaces: ${originalResult.totalSpaces}\n`);
        } catch (originalError) {
            const originalDuration = Date.now() - originalStartTime;
            console.log('❌ Original sync failed:');
            console.log(`   Duration before failure: ${Math.round(originalDuration / 1000)}s`);
            console.log(`   Error: ${originalError.message}\n`);
        }

        // Wait a moment before testing optimized version
        console.log('⏳ Waiting 3 seconds before testing optimized service...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test optimized sync service
        console.log('🚀 Testing OPTIMIZED sync service...');
        const optimizedStartTime = Date.now();
        
        try {
            const optimizedResult = await optimizedSyncService.syncAccountChats(account);
            const optimizedDuration = Date.now() - optimizedStartTime;
            
            console.log('✅ Optimized sync completed:');
            console.log(`   Duration: ${Math.round(optimizedDuration / 1000)}s`);
            console.log(`   Chats synced: ${optimizedResult.syncedChats}`);
            console.log(`   Messages synced: ${optimizedResult.syncedMessages}`);
            console.log(`   Total spaces: ${optimizedResult.totalSpaces}\n`);

            // Calculate performance improvement
            if (originalDuration) {
                const improvement = ((originalDuration - optimizedDuration) / originalDuration) * 100;
                console.log('📊 Performance Comparison:');
                console.log(`   Original: ${Math.round(originalDuration / 1000)}s`);
                console.log(`   Optimized: ${Math.round(optimizedDuration / 1000)}s`);
                console.log(`   Improvement: ${improvement.toFixed(1)}% faster\n`);
            }

        } catch (optimizedError) {
            const optimizedDuration = Date.now() - optimizedStartTime;
            console.log('❌ Optimized sync failed:');
            console.log(`   Duration before failure: ${Math.round(optimizedDuration / 1000)}s`);
            console.log(`   Error: ${optimizedError.message}\n`);
        }

        console.log('🎉 Performance test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}

// Function to test just the optimized sync
async function testOptimizedSync() {
    try {
        console.log('🧪 Testing OPTIMIZED sync service only...\n');

        // Get a test account
        const account = await Account.findOne({ 
            deletedAt: { $exists: false }
        });
        if (!account) {
            console.error('❌ No active account found for testing');
            process.exit(1);
        }

        console.log(`📧 Testing with account: ${account.email}\n`);

        // Test optimized sync service
        console.log('🚀 Starting optimized sync...');
        const startTime = Date.now();
        
        const result = await optimizedSyncService.syncAccountChats(account);
        const duration = Date.now() - startTime;
        
        console.log('✅ Optimized sync completed:');
        console.log(`   Duration: ${Math.round(duration / 1000)}s`);
        console.log(`   Chats synced: ${result.syncedChats}`);
        console.log(`   Messages synced: ${result.syncedMessages}`);
        console.log(`   Total spaces: ${result.totalSpaces}`);

        console.log('\n🎉 Optimized sync test completed successfully!');

    } catch (error) {
        console.error('❌ Optimized sync test failed:', error.message);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}

// Run the appropriate test based on command line argument
const testType = process.argv[2];

if (testType === 'optimized-only') {
    testOptimizedSync();
} else {
    testSyncPerformance();
}
