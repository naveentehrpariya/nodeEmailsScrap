#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

async function fixChatIndexes() {
    try {
        console.log('🔧 Connecting to MongoDB...');
        await mongoose.connect(process.env.DB_URL_OFFICE, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ Connected to database');
        
        const db = mongoose.connection.db;
        const collection = db.collection('chats');
        
        // Get current indexes
        console.log('📋 Current indexes:');
        const indexes = await collection.indexes();
        indexes.forEach(index => {
            console.log(`  - ${JSON.stringify(index.key)} (${index.name})`);
        });
        
        // Try to drop the problematic messageId index if it exists
        try {
            console.log('🗑️ Dropping problematic messageId unique index...');
            await collection.dropIndex('messages.messageId_1');
            console.log('✅ Successfully dropped messages.messageId_1 index');
        } catch (error) {
            if (error.message.includes('index not found')) {
                console.log('ℹ️ Index messages.messageId_1 not found (already removed or never existed)');
            } else {
                console.log('⚠️ Failed to drop index:', error.message);
            }
        }
        
        // Remove documents with null messageIds to prevent future issues
        console.log('🧹 Cleaning up documents with null messageIds...');
        const result = await collection.updateMany(
            { 'messages.messageId': null },
            { $pull: { messages: { messageId: null } } }
        );
        console.log(`✅ Cleaned up ${result.modifiedCount} documents with null messageIds`);
        
        // Create a non-unique index for better performance (optional)
        try {
            console.log('📊 Creating non-unique messageId index for performance...');
            await collection.createIndex({ 'messages.messageId': 1 }, { name: 'messages_messageId_nonunique' });
            console.log('✅ Created non-unique messageId index');
        } catch (error) {
            console.log('⚠️ Failed to create non-unique index:', error.message);
        }
        
        // Show final indexes
        console.log('📋 Final indexes:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach(index => {
            console.log(`  - ${JSON.stringify(index.key)} (${index.name})`);
        });
        
        console.log('🎉 Chat index cleanup completed successfully!');
        
    } catch (error) {
        console.error('❌ Error fixing chat indexes:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

// Run the fix
fixChatIndexes();
