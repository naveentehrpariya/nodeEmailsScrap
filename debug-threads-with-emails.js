#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function findThreadsWithEmails() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail, deletedAt: null });
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);

    // Find all account threads
    const allAccountThreads = await Thread.find({ 
      account: account._id, 
      deletedAt: null 
    }).lean();
    
    console.log(`📂 Total account threads: ${allAccountThreads.length}`);

    // Check which threads have emails
    console.log('\n🔍 Checking which threads have emails:');
    const threadsWithEmailCounts = await Promise.all(
      allAccountThreads.slice(0, 10).map(async (thread) => {
        const emailCount = await Email.countDocuments({ 
          thread: thread._id,
          deletedAt: null
        });
        const inboxCount = await Email.countDocuments({ 
          thread: thread._id,
          labelType: 'INBOX',
          deletedAt: null
        });
        const sentCount = await Email.countDocuments({ 
          thread: thread._id,
          labelType: 'SENT',
          deletedAt: null
        });
        
        return {
          thread,
          emailCount,
          inboxCount,
          sentCount
        };
      })
    );

    threadsWithEmailCounts.forEach((item, index) => {
      console.log(`   ${index + 1}. Thread: ${item.thread.subject || 'No subject'}`);
      console.log(`      Total emails: ${item.emailCount}`);
      console.log(`      INBOX: ${item.inboxCount}, SENT: ${item.sentCount}`);
      console.log('');
    });

    // Find the threads that actually have INBOX emails
    console.log('📧 Finding threads with INBOX emails...');
    const threadsWithInboxEmails = threadsWithEmailCounts.filter(item => item.inboxCount > 0);
    console.log(`Found ${threadsWithInboxEmails.length} threads with INBOX emails`);

    if (threadsWithInboxEmails.length > 0) {
      console.log('\n✅ Sample thread with INBOX emails:');
      const sample = threadsWithInboxEmails[0];
      console.log(`   Thread: ${sample.thread.subject || 'No subject'}`);
      console.log(`   Thread ID: ${sample.thread._id}`);
      console.log(`   INBOX emails: ${sample.inboxCount}`);
      
      // Get the actual emails
      const sampleEmails = await Email.find({
        thread: sample.thread._id,
        labelType: 'INBOX',
        deletedAt: null
      }).limit(2).lean();
      
      sampleEmails.forEach((email, index) => {
        console.log(`   Email ${index + 1}: ${email.subject || 'No subject'}`);
        console.log(`      From: ${email.from}`);
      });
    }

    // Check what's causing the mismatch
    console.log('\n🔍 Investigating the pagination issue...');
    
    // Get first 10 threads sorted by createdAt (same as API)
    const paginationThreads = await Thread.find({
      account: account._id,
      deletedAt: null
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    console.log('First 10 threads from pagination (sorted by createdAt):');
    for (let i = 0; i < paginationThreads.length; i++) {
      const thread = paginationThreads[i];
      const inboxCount = await Email.countDocuments({ 
        thread: thread._id,
        labelType: 'INBOX',
        deletedAt: null
      });
      console.log(`   ${i + 1}. ${thread.subject || 'No subject'} - INBOX: ${inboxCount}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

findThreadsWithEmails().catch(console.error);
