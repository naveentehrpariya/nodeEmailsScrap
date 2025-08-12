#!/usr/bin/env node

const mongoose = require('mongoose');
const Email = require('./db/Email');
const Account = require('./db/Account');
const Thread = require('./db/Thread');

// Load environment variables
require('dotenv').config();

async function checkEmails() {
  try {
    // Connect to database
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database:', dbUri);

    const targetEmail = 'naveendev@crossmilescarrier.com';
    
    // Find the account
    const account = await Account.findOne({ email: targetEmail });
    if (!account) {
      console.log('❌ Account not found:', targetEmail);
      return;
    }
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);
    
    // First, find all threads for this account
    const accountThreads = await Thread.find({ account: account._id });
    const threadIds = accountThreads.map(t => t._id);
    
    console.log('📂 Threads in Thread collection:', accountThreads.length);
    
    if (threadIds.length === 0) {
      console.log('❌ No threads found for this account!');
      return;
    }
    
    // Count total emails for this account's threads
    const totalEmails = await Email.countDocuments({ thread: { $in: threadIds } });
    console.log('📧 Total emails for account:', totalEmails);
    
    // Group emails by label type
    const labelCounts = await Email.aggregate([
      { $match: { thread: { $in: threadIds } } },
      { $group: { _id: '$labelType', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('\n📋 Emails by label:');
    labelCounts.forEach(label => {
      console.log(`   ${label._id || 'null'}: ${label.count} emails`);
    });
    
    // Count unique threads with emails
    const threadCounts = await Email.aggregate([
      { $match: { thread: { $in: threadIds } } },
      { $group: { _id: '$thread', count: { $sum: 1 } } }
    ]);
    
    console.log(`\n🧵 Threads with emails: ${threadCounts.length}`);
    
    // Sample a few emails to see their structure
    console.log('\n📋 Sample emails:');
    const sampleEmails = await Email.find({ thread: { $in: threadIds } })
      .limit(3)
      .select('subject labelType threadId gmailMessageId thread createdAt')
      .sort({ createdAt: -1 });
      
    sampleEmails.forEach((email, index) => {
      console.log(`   ${index + 1}. Subject: ${email.subject || 'No subject'}`);
      console.log(`      Label: ${email.labelType || 'null'}`);
      console.log(`      Thread ID: ${email.threadId || 'null'}`);
      console.log(`      Gmail ID: ${email.gmailMessageId || 'null'}`);
      console.log(`      Created: ${email.createdAt || 'null'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

checkEmails().catch(console.error);
