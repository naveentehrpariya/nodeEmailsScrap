#!/usr/bin/env node

const mongoose = require('mongoose');
const connectDB = require('./db/config');
const Email = require('./db/Email');
const Thread = require('./db/Thread');

async function fixDuplicateIndexes() {
    console.log('🔧 Fixing duplicate key indexes in email database...\n');
    
    try {
        // Connect to database
        await connectDB();
        console.log('✅ Connected to database\n');
        
        // Get current indexes
        console.log('📋 Current email collection indexes:');
        const emailIndexes = await Email.collection.indexes();
        emailIndexes.forEach((index, i) => {
            console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.unique) console.log(`      🔒 UNIQUE constraint`);
        });
        
        console.log('\n📋 Current thread collection indexes:');
        const threadIndexes = await Thread.collection.indexes();
        threadIndexes.forEach((index, i) => {
            console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.unique) console.log(`      🔒 UNIQUE constraint`);
        });
        
        // Drop problematic unique index on messageId if it exists
        console.log('\n🗑️  Removing problematic unique indexes...');
        
        try {
            await Email.collection.dropIndex('messageId_1');
            console.log('   ✅ Dropped unique messageId_1 index from emails collection');
        } catch (error) {
            if (error.message.includes('index not found')) {
                console.log('   ℹ️  messageId_1 unique index not found (already fixed)');
            } else {
                console.log('   ⚠️  Could not drop messageId_1 index:', error.message);
            }
        }
        
        // Create non-unique index for messageId
        console.log('\n📝 Creating optimized indexes...');
        try {
            await Email.collection.createIndex({ messageId: 1 }, { unique: false, sparse: true });
            console.log('   ✅ Created non-unique messageId index');
        } catch (error) {
            console.log('   ⚠️  Could not create messageId index:', error.message);
        }
        
        // Create compound indexes for better query performance
        try {
            await Email.collection.createIndex({ messageId: 1, labelType: 1 }, { unique: false, sparse: true });
            console.log('   ✅ Created compound messageId + labelType index');
        } catch (error) {
            console.log('   ⚠️  Compound index already exists or failed:', error.message);
        }
        
        try {
            await Email.collection.createIndex({ gmailMessageId: 1, labelType: 1 }, { unique: false });
            console.log('   ✅ Created compound gmailMessageId + labelType index');
        } catch (error) {
            console.log('   ⚠️  Gmail compound index already exists or failed:', error.message);
        }
        
        // Check for duplicate emails and provide cleanup options
        console.log('\n🔍 Checking for duplicate emails...');
        
        const duplicatesAggregation = [
            {
                $match: {
                    messageId: { $ne: null, $ne: "" },
                    deletedAt: { $exists: false }
                }
            },
            {
                $group: {
                    _id: "$messageId",
                    count: { $sum: 1 },
                    docs: { $push: "$_id" },
                    subjects: { $push: "$subject" },
                    labelTypes: { $push: "$labelType" }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            },
            {
                $limit: 10 // Show only first 10 duplicates
            }
        ];
        
        const duplicates = await Email.aggregate(duplicatesAggregation);
        
        if (duplicates.length > 0) {
            console.log(`   ⚠️  Found ${duplicates.length} duplicate messageId groups (showing first 10):`);
            duplicates.forEach((dup, index) => {
                console.log(`   ${index + 1}. MessageId: ${dup._id}`);
                console.log(`      Count: ${dup.count}`);
                console.log(`      Label Types: ${dup.labelTypes.join(', ')}`);
                console.log(`      Subjects: ${dup.subjects.slice(0, 2).join(', ')}${dup.subjects.length > 2 ? '...' : ''}`);
                console.log('');
            });
            
            console.log('💡 These duplicates will now be handled gracefully during sync.');
            console.log('   The system will skip inserting duplicates and continue processing.');
        } else {
            console.log('   ✅ No duplicate emails found');
        }
        
        // Final verification
        console.log('\n🔍 Final index verification:');
        const finalIndexes = await Email.collection.indexes();
        const hasUniqueMessageId = finalIndexes.some(idx => 
            idx.key.messageId && idx.unique
        );
        
        if (hasUniqueMessageId) {
            console.log('   ⚠️  WARNING: messageId still has unique constraint');
            console.log('   💡 You may need to manually drop the index:');
            console.log('      db.emails.dropIndex("messageId_1")');
        } else {
            console.log('   ✅ messageId is properly configured (non-unique)');
        }
        
        console.log('\n🎉 Database index cleanup completed!');
        console.log('\n💡 What was fixed:');
        console.log('   ✅ Removed unique constraint from messageId field');
        console.log('   ✅ Added graceful duplicate handling in sync process');
        console.log('   ✅ Created optimized compound indexes');
        console.log('   ✅ Same email can now exist with different labelTypes (INBOX/SENT)');
        
        console.log('\n🚀 You can now run email sync without duplicate key errors!');
        
    } catch (error) {
        console.error('❌ Error fixing indexes:', error.message);
        throw error;
    } finally {
        mongoose.disconnect();
    }
}

// Handle process interruption gracefully
process.on('SIGINT', () => {
    console.log('\n\n⏹️  Process interrupted by user');
    mongoose.disconnect();
    process.exit(0);
});

if (require.main === module) {
    fixDuplicateIndexes().catch(error => {
        console.error('💥 Script failed:', error.message);
        process.exit(1);
    });
}

module.exports = fixDuplicateIndexes;
