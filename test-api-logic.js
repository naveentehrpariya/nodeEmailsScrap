#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function testGetAccountThreads() {
  try {
    // Connect to database
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    // Simulate the API logic
    const accountId = 'naveendev@crossmilescarrier.com';
    const labelType = 'INBOX';
    const page = 1;
    const limit = 10;

    // Check if accountId is an email or ObjectId
    let accountQuery;
    if (accountId.includes('@')) {
      accountQuery = { email: accountId, deletedAt: null };
    } else {
      accountQuery = { _id: accountId, deletedAt: null };
    }
    
    console.log('🔍 Looking for account with query:', accountQuery);
    const account = await Account.findOne(accountQuery);
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);
    
    // Get threads for this account
    console.log('🔍 Looking for threads with account:', account._id);
    const threads = await Thread.find({
      account: account._id,
      deletedAt: null
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();
    
    console.log(`📂 Found ${threads.length} threads`);
    
    // Get emails for each thread filtered by labelType
    const threadsWithEmails = await Promise.all(
      threads.map(async (thread) => {
        console.log(`   🔍 Looking for ${labelType} emails in thread:`, thread._id);
        const emails = await Email.find({
          thread: thread._id,
          labelType: labelType.toUpperCase(),
          deletedAt: null
        })
        .sort({ createdAt: -1 })
        .lean();
        
        console.log(`      Found ${emails.length} ${labelType} emails`);
        
        return {
          ...thread,
          emails: emails,
          emailCount: emails.length
        };
      })
    );
    
    // Filter out threads with no emails of the requested type
    const filteredThreads = threadsWithEmails.filter(thread => thread.emailCount > 0);
    
    console.log(`📧 Threads with ${labelType} emails: ${filteredThreads.length}`);
    
    const totalThreads = await Thread.countDocuments({
      account: account._id,
      deletedAt: null
    });
    
    console.log(`📊 Total threads for account: ${totalThreads}`);
    
    console.log('\n📋 Result summary:');
    console.log(`   Total threads found: ${threads.length}`);
    console.log(`   Threads with ${labelType} emails: ${filteredThreads.length}`);
    console.log(`   Total thread count: ${totalThreads}`);
    
    if (filteredThreads.length > 0) {
      console.log('\n📧 Sample thread with emails:');
      const sample = filteredThreads[0];
      console.log(`   Thread: ${sample.subject || 'No subject'}`);
      console.log(`   Emails: ${sample.emailCount}`);
      if (sample.emails.length > 0) {
        console.log(`   First email: ${sample.emails[0].subject || 'No subject'}`);
        console.log(`   From: ${sample.emails[0].from || 'Unknown'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

testGetAccountThreads().catch(console.error);
