#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function findEmailThreads() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail, deletedAt: null });
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);

    // Get all threads for the account
    const allThreads = await Thread.find({ 
      account: account._id, 
      deletedAt: null 
    }).lean();

    console.log(`📂 Total threads: ${allThreads.length}`);

    // Find emails and group by thread
    const emails = await Email.find({ 
      thread: { $in: allThreads.map(t => t._id) },
      deletedAt: null
    }).lean();

    console.log(`📧 Total emails: ${emails.length}`);

    // Group emails by thread
    const emailsByThread = {};
    emails.forEach(email => {
      const threadId = email.thread.toString();
      if (!emailsByThread[threadId]) {
        emailsByThread[threadId] = [];
      }
      emailsByThread[threadId].push(email);
    });

    console.log(`📊 Threads with emails: ${Object.keys(emailsByThread).length}`);

    // Find which thread IDs have emails
    console.log('\n📋 Threads that contain emails:');
    const threadsWithEmails = allThreads.filter(thread => {
      const threadId = thread._id.toString();
      return emailsByThread[threadId] && emailsByThread[threadId].length > 0;
    });

    threadsWithEmails.slice(0, 10).forEach((thread, index) => {
      const threadId = thread._id.toString();
      const threadEmails = emailsByThread[threadId];
      const inboxCount = threadEmails.filter(e => e.labelType === 'INBOX').length;
      const sentCount = threadEmails.filter(e => e.labelType === 'SENT').length;
      
      console.log(`   ${index + 1}. Thread: ${thread.subject || 'No subject'}`);
      console.log(`      Created: ${thread.createdAt}`);
      console.log(`      Total: ${threadEmails.length}, INBOX: ${inboxCount}, SENT: ${sentCount}`);
      console.log('');
    });

    // Compare creation dates
    console.log('🔍 Comparing creation dates:');
    console.log('Empty threads (first 3):');
    allThreads.slice(0, 3).forEach((thread, index) => {
      console.log(`   ${index + 1}. ${thread.subject} - Created: ${thread.createdAt}`);
    });

    console.log('\nThreads with emails (first 3):');
    threadsWithEmails.slice(0, 3).forEach((thread, index) => {
      console.log(`   ${index + 1}. ${thread.subject} - Created: ${thread.createdAt}`);
    });

    // Check if there's a different sorting that would work better
    console.log('\n📊 If we sort threads with emails by createdAt:');
    const sortedThreadsWithEmails = threadsWithEmails
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    sortedThreadsWithEmails.forEach((thread, index) => {
      const threadId = thread._id.toString();
      const threadEmails = emailsByThread[threadId];
      const inboxCount = threadEmails.filter(e => e.labelType === 'INBOX').length;
      
      console.log(`   ${index + 1}. ${thread.subject || 'No subject'}`);
      console.log(`      Created: ${thread.createdAt}`);
      console.log(`      INBOX emails: ${inboxCount}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

findEmailThreads().catch(console.error);
