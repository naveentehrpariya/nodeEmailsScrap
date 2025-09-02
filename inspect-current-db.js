const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/emailscrap';

async function inspectDatabase() {
    console.log('🔍 INSPECTING CURRENT DATABASE STRUCTURE');
    console.log('=========================================');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        // Get all collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('\n📚 Available collections:');
        collections.forEach((col, i) => {
            console.log(`   ${i + 1}. ${col.name}`);
        });
        
        // Look for any chat-related collection
        const chatCollections = collections.filter(col => 
            col.name.toLowerCase().includes('chat') || 
            col.name.toLowerCase().includes('message')
        );
        
        if (chatCollections.length === 0) {
            console.log('\n❌ No chat-related collections found');
        } else {
            console.log('\n💬 Chat-related collections:');
            
            for (const col of chatCollections) {
                console.log(`\n📋 Collection: ${col.name}`);
                const collection = mongoose.connection.db.collection(col.name);
                
                // Get sample documents
                const sampleDocs = await collection.find({}).limit(3).toArray();
                console.log(`   Documents: ${sampleDocs.length}`);
                
                sampleDocs.forEach((doc, i) => {
                    console.log(`\n   Document ${i + 1}:`);
                    console.log(`     _id: ${doc._id}`);
                    if (doc.spaceId) console.log(`     spaceId: ${doc.spaceId}`);
                    if (doc.displayName) console.log(`     displayName: ${doc.displayName}`);
                    if (doc.name) console.log(`     name: ${doc.name}`);
                    if (doc.accountEmail) console.log(`     accountEmail: ${doc.accountEmail}`);
                    if (doc.account) console.log(`     account: ${doc.account}`);
                    if (doc.spaceType) console.log(`     spaceType: ${doc.spaceType}`);
                    if (doc.participants) {
                        console.log(`     participants: ${doc.participants.length}`);
                        doc.participants.forEach((p, j) => {
                            console.log(`       ${j + 1}. ${p.displayName || p.name} (${p.email}) - ${p.userId}`);
                        });
                    }
                    if (doc.messages && doc.messages.length > 0) {
                        console.log(`     messages: ${doc.messages.length}`);
                        doc.messages.slice(0, 2).forEach((msg, j) => {
                            console.log(`       ${j + 1}. "${msg.text?.substring(0, 30)}..." by ${msg.senderEmail}`);
                        });
                    }
                });
                
                // Look specifically for test chat
                console.log(`\n🔍 Looking for test chat in ${col.name}...`);
                const testChatQuery = {
                    $or: [
                        { spaceId: 'spaces/2pUolCAAAAE' },
                        { displayName: /test/i },
                        { name: /test/i },
                        { 'participants.displayName': /test/i },
                        { 'participants.name': /test/i }
                    ]
                };
                
                const testChats = await collection.find(testChatQuery).toArray();
                console.log(`   Found ${testChats.length} potential test chats`);
                
                testChats.forEach((chat, i) => {
                    console.log(`\n   🎯 Test Chat ${i + 1}:`);
                    console.log(`     _id: ${chat._id}`);
                    console.log(`     spaceId: ${chat.spaceId}`);
                    console.log(`     displayName: ${chat.displayName || chat.name}`);
                    console.log(`     spaceType: ${chat.spaceType}`);
                    if (chat.participants) {
                        console.log(`     participants: ${chat.participants.length}`);
                        chat.participants.forEach((p, j) => {
                            console.log(`       ${j + 1}. ${p.displayName || p.name} (${p.email})`);
                        });
                    }
                    if (chat.messages && chat.messages.length > 0) {
                        console.log(`     messages: ${chat.messages.length}`);
                        chat.messages.forEach((msg, j) => {
                            console.log(`       ${j + 1}. "${msg.text}" by ${msg.senderEmail} (${msg.senderDisplayName})`);
                        });
                    }
                });
            }
        }
        
        // Also check accounts
        const accountsCol = collections.find(col => col.name.toLowerCase().includes('account'));
        if (accountsCol) {
            console.log(`\n👤 Checking accounts collection...`);
            const accounts = await mongoose.connection.db.collection(accountsCol.name).find({}).toArray();
            console.log(`   Total accounts: ${accounts.length}`);
            accounts.forEach((acc, i) => {
                console.log(`   ${i + 1}. ${acc.email || acc.name || acc._id}`);
            });
        }
        
        console.log('\n✅ Database inspection completed');
        
    } catch (error) {
        console.error('❌ Error during inspection:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run the inspection
inspectDatabase();
