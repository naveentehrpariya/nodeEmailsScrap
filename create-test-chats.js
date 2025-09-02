require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function createTestChats() {
    const client = new MongoClient(process.env.DB_URL_OFFICE);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔧 Creating test chats to verify name resolution...');
        
        // Get the naveendev account
        const account = await db.collection('accounts').findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Account not found');
        }
        
        console.log(`✅ Found account: ${account._id}`);
        
        // Create test DM chats with the user IDs we improved
        const testChats = [
            {
                account: account._id,
                spaceId: 'spaces/test_chat_1',
                displayName: 'Contact 11504808', // This will be resolved by UserMapping
                spaceType: 'DIRECT_MESSAGE',
                participants: [
                    {
                        userId: 'users/108506371856200018714', // naveendev
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'naveendev'
                    },
                    {
                        userId: 'users/115048080534626721571', // This should resolve to "Contact 11504808"
                        email: 'user-115048080534626721571@crossmilescarrier.com',
                        displayName: 'User 11504808' // This should be replaced by UserMapping
                    }
                ],
                messages: [
                    {
                        messageId: 'msg_1',
                        text: 'Hello, this is a test message',
                        senderId: 'users/108506371856200018714',
                        senderEmail: 'naveendev@crossmilescarrier.com',
                        senderDisplayName: 'naveendev',
                        isSentByCurrentUser: true,
                        createTime: new Date('2025-08-24T10:00:00.000Z'),
                        attachments: []
                    },
                    {
                        messageId: 'msg_2',
                        text: 'This is a reply',
                        senderId: 'users/115048080534626721571',
                        senderEmail: 'user-115048080534626721571@crossmilescarrier.com',
                        senderDisplayName: 'User 11504808', // This should be improved
                        isSentByCurrentUser: false,
                        createTime: new Date('2025-08-24T10:05:00.000Z'),
                        attachments: []
                    }
                ],
                messageCount: 2,
                lastMessageTime: new Date('2025-08-24T10:05:00.000Z'),
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                account: account._id,
                spaceId: 'spaces/test_chat_2',
                displayName: 'Contact 10432983',
                spaceType: 'DIRECT_MESSAGE',
                participants: [
                    {
                        userId: 'users/108506371856200018714', // naveendev
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'naveendev'
                    },
                    {
                        userId: 'users/104329836262309309664', // This should resolve to "Contact 10432983"
                        email: 'user-104329836262309309664@crossmilescarrier.com',
                        displayName: 'User 10432983'
                    }
                ],
                messages: [
                    {
                        messageId: 'msg_3',
                        text: 'Another test conversation',
                        senderId: 'users/108506371856200018714',
                        senderEmail: 'naveendev@crossmilescarrier.com',
                        senderDisplayName: 'naveendev',
                        isSentByCurrentUser: true,
                        createTime: new Date('2025-08-24T11:00:00.000Z'),
                        attachments: []
                    }
                ],
                messageCount: 1,
                lastMessageTime: new Date('2025-08-24T11:00:00.000Z'),
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                account: account._id,
                spaceId: 'spaces/test_space_1',
                displayName: 'Test Group Chat',
                spaceType: 'SPACE',
                participants: [
                    {
                        userId: 'users/108506371856200018714', // naveendev
                        email: 'naveendev@crossmilescarrier.com',
                        displayName: 'naveendev'
                    },
                    {
                        userId: 'users/117473277652603932566', // narender - this has a proper name
                        email: 'narender@crossmilescarrier.com',
                        displayName: 'narender'
                    }
                ],
                messages: [
                    {
                        messageId: 'msg_4',
                        text: 'Group chat message',
                        senderId: 'users/117473277652603932566',
                        senderEmail: 'narender@crossmilescarrier.com',
                        senderDisplayName: 'narender',
                        isSentByCurrentUser: false,
                        createTime: new Date('2025-08-24T12:00:00.000Z'),
                        attachments: []
                    }
                ],
                messageCount: 1,
                lastMessageTime: new Date('2025-08-24T12:00:00.000Z'),
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];
        
        // Insert the test chats
        const result = await db.collection('chats').insertMany(testChats);
        console.log(`✅ Created ${result.insertedCount} test chats`);
        
        // Verify the chats were created
        const chatCount = await db.collection('chats').countDocuments({ account: account._id });
        console.log(`📊 Total chats for account: ${chatCount}`);
        
        console.log('\\n🎉 Test chats created! Now you can test the API to see improved name resolution.');
        console.log('   The UserMapping should resolve:');
        console.log('   - users/115048080534626721571 -> Contact 11504808');
        console.log('   - users/104329836262309309664 -> Contact 10432983');
        console.log('   - users/117473277652603932566 -> narender (already proper)');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

createTestChats();
