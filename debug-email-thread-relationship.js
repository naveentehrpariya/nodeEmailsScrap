#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function debugRelationship() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail, deletedAt: null });
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);

    // Check total emails for this account (via any thread relationship)
    const accountThreads = await Thread.find({ account: account._id, deletedAt: null }).select('_id').lean();
    const threadIds = accountThreads.map(t => t._id);
    
    console.log(`📂 Account threads: ${accountThreads.length}`);
    console.log('   Sample thread IDs:', threadIds.slice(0, 3).map(id => id.toString()));

    // Check total emails across all threads
    const emailsInAccountThreads = await Email.countDocuments({ 
      thread: { $in: threadIds } 
    });
    console.log(`📧 Emails in account threads: ${emailsInAccountThreads}`);

    // Check emails by labelType across account threads
    const inboxEmailsInAccount = await Email.countDocuments({ 
      thread: { $in: threadIds },
      labelType: 'INBOX'
    });
    console.log(`📧 INBOX emails in account: ${inboxEmailsInAccount}`);

    const sentEmailsInAccount = await Email.countDocuments({ 
      thread: { $in: threadIds },
      labelType: 'SENT'
    });
    console.log(`📧 SENT emails in account: ${sentEmailsInAccount}`);

    // Find some emails and check their thread references
    console.log('\n📋 Sample emails and their threads:');
    const sampleEmails = await Email.find({ 
      thread: { $in: threadIds } 
    }).limit(5).lean();
    
    for (let i = 0; i < sampleEmails.length; i++) {
      const email = sampleEmails[i];
      console.log(`   ${i + 1}. Email: ${email.subject || 'No subject'}`);
      console.log(`      From: ${email.from}`);
      console.log(`      Label: ${email.labelType}`);
      console.log(`      Thread ID: ${email.thread}`);
      console.log(`      Thread exists: ${threadIds.some(tid => tid.toString() === email.thread?.toString())}`);
      console.log('');
    }

    // Check if thread field type matches
    console.log('🔍 Checking thread field types...');
    const emailWithThread = await Email.findOne({ thread: { $exists: true } }).lean();
    if (emailWithThread) {
      console.log(`   Email thread field: ${emailWithThread.thread} (${typeof emailWithThread.thread})`);
      const correspondingThread = await Thread.findById(emailWithThread.thread).lean();
      if (correspondingThread) {
        console.log(`   Thread found: ${correspondingThread.subject || 'No subject'}`);
        console.log(`   Thread account: ${correspondingThread.account}`);
        console.log(`   Thread account matches: ${correspondingThread.account?.toString() === account._id.toString()}`);
      } else {
        console.log('   ❌ Thread not found for email thread reference');
      }
    }

    // Check if emails use threadId string field instead of thread ObjectId field
    console.log('\n🔍 Checking threadId string field...');
    const emailsWithThreadId = await Email.countDocuments({ 
      threadId: { $exists: true } 
    });
    console.log(`📧 Emails with threadId string: ${emailsWithThreadId}`);

    if (emailsWithThreadId > 0) {
      const sampleEmailWithThreadId = await Email.findOne({ threadId: { $exists: true } }).lean();
      console.log(`   Sample threadId: ${sampleEmailWithThreadId.threadId}`);
      
      // Try to find thread by threadId string
      const threadByThreadId = await Thread.findOne({ threadId: sampleEmailWithThreadId.threadId }).lean();
      if (threadByThreadId) {
        console.log(`   Thread found by threadId: ${threadByThreadId.subject || 'No subject'}`);
        console.log(`   Thread account: ${threadByThreadId.account}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

debugRelationship().catch(console.error);
