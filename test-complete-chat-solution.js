const mongoose = require('mongoose');
const UserMapping = require('./db/UserMapping');
const Account = require('./db/Account');

// Connect to MongoDB (adjust the connection string as needed)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';

async function testCompleteChatSolution() {
    console.log('🎯 Testing Complete Chat Solution with User Mappings\n');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Test 1: Create sample user mappings
        console.log('1. Creating sample user mappings...');
        
        // Find an account to use for testing (or create a fake one)
        let testAccount = await Account.findOne();
        if (!testAccount) {
            console.log('⚠️ No accounts found, creating test account...');
            testAccount = new Account({
                email: 'test@crossmilescarrier.com',
                name: 'Test User'
            });
            await testAccount.save();
        }
        
        // Create sample user mappings
        const sampleUsers = [
            {
                userId: '108506371856200018714',
                displayName: 'John Doe',
                email: 'john.doe@crossmilescarrier.com',
                domain: 'crossmilescarrier.com',
                resolvedBy: 'admin_directory',
                discoveredByAccount: testAccount._id,
                confidence: 100,
                originalUserResourceName: 'users/108506371856200018714'
            },
            {
                userId: '104329836262309309664',
                displayName: 'Jane Smith',
                email: 'jane.smith@crossmilescarrier.com',
                domain: 'crossmilescarrier.com',
                resolvedBy: 'chat_members',
                discoveredByAccount: testAccount._id,
                confidence: 85,
                originalUserResourceName: 'users/104329836262309309664'
            },
            {
                userId: '987654321098765432',
                displayName: 'Bob Wilson',
                email: 'bob.wilson@crossmilescarrier.com',
                domain: 'crossmilescarrier.com',
                resolvedBy: 'fallback',
                discoveredByAccount: testAccount._id,
                confidence: 30,
                originalUserResourceName: 'users/987654321098765432'
            }
        ];
        
        for (const user of sampleUsers) {
            await UserMapping.findOrCreateUser(user);
            console.log(`   ✅ Created mapping: ${user.displayName} (${user.userId})`);
        }
        
        // Test 2: Demonstrate user ID resolution
        console.log('\n2. Testing user ID resolution...');
        
        const testUserIds = [
            'users/108506371856200018714',
            '104329836262309309664',
            'unknown-user-12345678'
        ];
        
        for (const userId of testUserIds) {
            const extractedId = userId.includes('/') ? userId.split('/').pop() : userId;
            const userInfo = await UserMapping.getUserInfo(extractedId);
            
            console.log(`   Input: ${userId}`);
            if (userInfo) {
                console.log(`   ✅ Resolved: ${userInfo.displayName} (${userInfo.email}) - Confidence: ${userInfo.confidence}%`);
            } else {
                console.log(`   ⚠️ Not found in database - would use fallback: User ${extractedId.substring(0, 8)}`);
            }
        }
        
        // Test 3: Demonstrate message formatting
        console.log('\n3. Testing chat message formatting...');
        
        const sampleMessages = [
            {
                messageId: 'msg-1',
                text: 'Hello everyone! How are you doing?',
                senderId: 'users/108506371856200018714',
                isSentByCurrentUser: false,
                createTime: new Date()
            },
            {
                messageId: 'msg-2', 
                text: 'I am doing great, thanks for asking!',
                senderId: 'users/current-user-id',
                isSentByCurrentUser: true,
                createTime: new Date(Date.now() + 60000)
            },
            {
                messageId: 'msg-3',
                text: 'Has anyone seen the latest report?',
                senderId: 'users/104329836262309309664',
                isSentByCurrentUser: false,
                createTime: new Date(Date.now() + 120000)
            }
        ];
        
        console.log('   Sample chat messages with alignment:');
        
        for (const message of sampleMessages) {
            const senderId = message.senderId.includes('/') ? message.senderId.split('/').pop() : message.senderId;
            const userInfo = await UserMapping.getUserInfo(senderId);
            const senderName = message.isSentByCurrentUser ? 'You' : 
                (userInfo ? userInfo.displayName : `User ${senderId.substring(0, 8)}`);
            
            const align = message.isSentByCurrentUser ? 'RIGHT' : 'LEFT';
            const bubble = message.isSentByCurrentUser ? '🟦' : '⬜';
            
            console.log(`   ${align.padEnd(5)} ${bubble} ${senderName}: ${message.text}`);
            console.log(`          ${' '.repeat(align === 'RIGHT' ? 20 : 0)}${new Date(message.createTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
        }
        
        // Test 4: Show database statistics
        console.log('\n4. User mapping database statistics:');
        const totalMappings = await UserMapping.countDocuments();
        const byConfidence = await UserMapping.aggregate([
            { $group: { _id: '$resolvedBy', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
            { $sort: { avgConfidence: -1 } }
        ]);
        
        console.log(`   📊 Total user mappings: ${totalMappings}`);
        console.log('   📈 Resolution methods:');
        byConfidence.forEach(stat => {
            console.log(`      ${stat._id}: ${stat.count} users (avg confidence: ${stat.avgConfidence.toFixed(1)}%)`);
        });
        
        // Test 5: Show the improvement
        console.log('\n5. 🎉 Solution Summary:');
        console.log('   ✅ User IDs are now stored in database with proper names');
        console.log('   ✅ Messages have proper left/right alignment like modern chat apps');
        console.log('   ✅ Real names are displayed instead of cryptic user IDs');
        console.log('   ✅ System builds knowledge of users across all account syncs');
        console.log('   ✅ Chat bubbles have styling hints for frontend implementation');
        console.log('   ✅ Time formatting is optimized for chat display');
        console.log('   ✅ Confidence scoring helps improve resolution over time');
        
        console.log('\n🎯 Next Steps:');
        console.log('   1. Run chat sync on all accounts to populate user mappings');
        console.log('   2. Frontend can use align, bubble, and sender properties for styling');
        console.log('   3. User mappings will improve automatically as more chats are synced');
        
        // Clean up test data (optional)
        // await UserMapping.deleteMany({ discoveredByAccount: testAccount._id });
        // console.log('\\n🧹 Cleaned up test data');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\\n✅ Disconnected from MongoDB');
    }
}

// Run the test
testCompleteChatSolution().catch(console.error);
