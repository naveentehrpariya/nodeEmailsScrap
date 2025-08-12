#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function debugExactQuery() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail, deletedAt: { $exists: false } });
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);

    // Test the exact query from the API
    const page = 1;
    const limit = 10;
    
    const query = {
      account: account._id,
      deletedAt: { $exists: false }
    };
    
    console.log('🔍 Testing exact API query:', JSON.stringify(query, null, 2));
    
    const threads = await Thread.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();
      
    console.log(`📂 Query result: ${threads.length} threads`);
    
    // Let's also test without the deletedAt filter
    console.log('🔍 Testing without deletedAt filter...');
    const threadsWithoutDeletedFilter = await Thread.find({ account: account._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();
      
    console.log(`📂 Without deletedAt filter: ${threadsWithoutDeletedFilter.length} threads`);
    
    // Let's check if any threads have deletedAt set
    console.log('🔍 Checking deletedAt field on sample threads...');
    const sampleThreads = await Thread.find({ account: account._id }).limit(3).lean();
    
    sampleThreads.forEach((thread, index) => {
      console.log(`   ${index + 1}. Thread ID: ${thread._id}`);
      console.log(`      Subject: ${thread.subject || 'No subject'}`);
      console.log(`      deletedAt: ${thread.deletedAt || 'not set'}`);
      console.log(`      deletedAt exists: ${thread.deletedAt !== undefined}`);
      console.log('');
    });
    
    // Let's also test the count query
    const totalCount = await Thread.countDocuments({
      account: account._id,
      deletedAt: { $exists: false }
    });
    
    console.log(`📊 Total count with deletedAt filter: ${totalCount}`);
    
    const totalCountWithoutFilter = await Thread.countDocuments({
      account: account._id
    });
    
    console.log(`📊 Total count without deletedAt filter: ${totalCountWithoutFilter}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

debugExactQuery().catch(console.error);
