#!/usr/bin/env node

const mongoose = require('mongoose');
const Email = require('./db/Email');
require('dotenv').config();

async function addSearchIndexes() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    // Add indexes for search fields
    console.log('📊 Adding search performance indexes...');

    // Individual field indexes for better search performance
    await Email.collection.createIndex({ gmailMessageId: 1 });
    console.log('✅ Added index on gmailMessageId');

    await Email.collection.createIndex({ from: 1 });
    console.log('✅ Added index on from');

    await Email.collection.createIndex({ to: 1 });
    console.log('✅ Added index on to');

    await Email.collection.createIndex({ subject: 1 });
    console.log('✅ Added index on subject');

    // Text index for full-text search on multiple fields
    await Email.collection.createIndex({
      gmailMessageId: 'text',
      from: 'text',
      to: 'text',
      subject: 'text',
      textBlocks: 'text'
    }, {
      name: 'email_search_text'
    });
    console.log('✅ Added compound text index for full-text search');

    // Compound indexes for better query performance
    await Email.collection.createIndex({ thread: 1, labelType: 1, deletedAt: 1 });
    console.log('✅ Added compound index on thread, labelType, deletedAt');

    await Email.collection.createIndex({ labelType: 1, deletedAt: 1, createdAt: -1 });
    console.log('✅ Added compound index on labelType, deletedAt, createdAt');

    // List all indexes to verify
    console.log('\n📋 Current indexes on emails collection:');
    const indexes = await Email.collection.indexes();
    indexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log('\n🎉 Search indexes added successfully!');
    
  } catch (error) {
    console.error('❌ Error adding indexes:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

addSearchIndexes().catch(console.error);
