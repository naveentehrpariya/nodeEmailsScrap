#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function debugEmails() {
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

    // Get a sample thread for this account
    const sampleThread = await Thread.findOne({ 
      account: account._id, 
      deletedAt: null 
    }).lean();
    
    if (!sampleThread) {
      console.log('❌ No threads found');
      return;
    }
    
    console.log('📂 Sample thread:', sampleThread._id);
    console.log('   Subject:', sampleThread.subject || 'No subject');

    // Check total emails in this thread
    const totalEmailsInThread = await Email.countDocuments({ thread: sampleThread._id });
    console.log(`📧 Total emails in thread: ${totalEmailsInThread}`);

    // Check emails with different labelTypes
    const inboxEmails = await Email.countDocuments({ 
      thread: sampleThread._id, 
      labelType: 'INBOX' 
    });
    console.log(`📧 INBOX emails: ${inboxEmails}`);

    const sentEmails = await Email.countDocuments({ 
      thread: sampleThread._id, 
      labelType: 'SENT' 
    });
    console.log(`📧 SENT emails: ${sentEmails}`);

    // Check emails with deletedAt filter
    const emailsWithDeletedNull = await Email.countDocuments({ 
      thread: sampleThread._id, 
      deletedAt: null 
    });
    console.log(`📧 Emails with deletedAt: null: ${emailsWithDeletedNull}`);

    const emailsWithDeletedNotExists = await Email.countDocuments({ 
      thread: sampleThread._id, 
      deletedAt: { $exists: false } 
    });
    console.log(`📧 Emails with deletedAt not exists: ${emailsWithDeletedNotExists}`);

    // Sample some emails to see their structure
    console.log('\n📋 Sample emails in thread:');
    const sampleEmails = await Email.find({ thread: sampleThread._id }).limit(3).lean();
    
    sampleEmails.forEach((email, index) => {
      console.log(`   ${index + 1}. Email ID: ${email._id}`);
      console.log(`      Subject: ${email.subject || 'No subject'}`);
      console.log(`      From: ${email.from || 'Unknown'}`);
      console.log(`      Label Type: ${email.labelType || 'Not set'}`);
      console.log(`      deletedAt: ${email.deletedAt || 'not set'}`);
      console.log(`      deletedAt exists: ${email.deletedAt !== undefined}`);
      console.log(`      deletedAt is null: ${email.deletedAt === null}`);
      console.log('');
    });

    // Test the exact query used in the API
    console.log('🔍 Testing exact API email query...');
    const apiEmails = await Email.find({
      thread: sampleThread._id,
      labelType: 'INBOX',
      deletedAt: null
    }).lean();
    
    console.log(`📧 API query result: ${apiEmails.length} emails`);

    // Try without deletedAt filter
    const emailsWithoutDeletedFilter = await Email.find({
      thread: sampleThread._id,
      labelType: 'INBOX'
    }).lean();
    
    console.log(`📧 Without deletedAt filter: ${emailsWithoutDeletedFilter.length} emails`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

debugEmails().catch(console.error);
