#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function debugThreads() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail });
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);
    console.log('   Account ID type:', typeof account._id);

    // Check total threads in database
    const allThreads = await Thread.countDocuments({});
    console.log(`📂 Total threads in database: ${allThreads}`);

    // Look for threads with various queries
    const threadsWithAccountId = await Thread.countDocuments({ account: account._id });
    console.log(`📂 Threads with account ObjectId: ${threadsWithAccountId}`);
    
    const threadsWithAccountString = await Thread.countDocuments({ account: account._id.toString() });
    console.log(`📂 Threads with account as string: ${threadsWithAccountString}`);

    // Sample some threads to see their structure
    console.log('\n📋 Sample threads:');
    const sampleThreads = await Thread.find({}).limit(5).lean();
    
    sampleThreads.forEach((thread, index) => {
      console.log(`   ${index + 1}. Thread ID: ${thread._id}`);
      console.log(`      Subject: ${thread.subject || 'No subject'}`);
      console.log(`      Account: ${thread.account} (type: ${typeof thread.account})`);
      console.log(`      Account matches: ${thread.account?.toString() === account._id.toString()}`);
      console.log('');
    });

    // Look for threads that might belong to this account by email
    console.log('🔍 Looking for threads by email or other fields...');
    const threadsWithEmail = await Thread.find({
      $or: [
        { from: { $regex: targetEmail, $options: 'i' } },
        { to: { $regex: targetEmail, $options: 'i' } }
      ]
    }).limit(3).lean();
    
    console.log(`📧 Threads mentioning email: ${threadsWithEmail.length}`);
    threadsWithEmail.forEach((thread, index) => {
      console.log(`   ${index + 1}. Subject: ${thread.subject}`);
      console.log(`      From: ${thread.from}`);
      console.log(`      To: ${thread.to}`);
      console.log(`      Account: ${thread.account}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

debugThreads().catch(console.error);
