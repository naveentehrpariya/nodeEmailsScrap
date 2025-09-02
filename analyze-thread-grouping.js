#!/usr/bin/env node

/**
 * Analyze thread grouping issues in email sync
 * This script will identify if emails that should be in the same thread 
 * are being split into separate database threads
 */

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function analyzeThreadGrouping() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('🔗 Connected to database');

    console.log('🔍 Analyzing thread grouping issues...\n');

    // Find all accounts
    const accounts = await Account.find({ deletedAt: { $exists: false } }).lean();
    
    for (const account of accounts.slice(0, 2)) { // Check first 2 accounts
      console.log(`\n👤 Analyzing account: ${account.email}`);
      
      // Group all emails by Gmail threadId to see if they're properly grouped in database
      const emails = await Email.find({ 
        thread: { $exists: true },
        deletedAt: null 
      }).populate('thread').lean();
      
      // Filter emails for this account
      const accountEmails = emails.filter(email => 
        email.thread && email.thread.account?.toString() === account._id.toString()
      );
      
      if (accountEmails.length === 0) {
        console.log('   ⚠️  No emails found for this account');
        continue;
      }
      
      console.log(`   📧 Found ${accountEmails.length} total emails`);
      
      // Group by Gmail threadId
      const emailsByGmailThread = {};
      accountEmails.forEach(email => {
        const gmailThreadId = email.threadId; // Gmail's thread ID
        if (!emailsByGmailThread[gmailThreadId]) {
          emailsByGmailThread[gmailThreadId] = [];
        }
        emailsByGmailThread[gmailThreadId].push(email);
      });
      
      console.log(`   🧵 Found ${Object.keys(emailsByGmailThread).length} Gmail threads`);
      
      // Check for threading issues
      let issueCount = 0;
      let totalConversations = 0;
      
      for (const [gmailThreadId, emails] of Object.entries(emailsByGmailThread)) {
        totalConversations++;
        
        // Group by database thread ID
        const emailsByDbThread = {};
        emails.forEach(email => {
          const dbThreadId = email.thread._id.toString();
          if (!emailsByDbThread[dbThreadId]) {
            emailsByDbThread[dbThreadId] = [];
          }
          emailsByDbThread[dbThreadId].push(email);
        });
        
        // If emails from same Gmail thread are in multiple database threads, that's an issue
        const dbThreadCount = Object.keys(emailsByDbThread).length;
        
        if (dbThreadCount > 1) {
          issueCount++;
          console.log(`   ❌ ISSUE FOUND - Gmail thread ${gmailThreadId} split into ${dbThreadCount} database threads:`);
          
          for (const [dbThreadId, threadEmails] of Object.entries(emailsByDbThread)) {
            const labelTypes = [...new Set(threadEmails.map(e => e.labelType))];
            const subjects = [...new Set(threadEmails.map(e => e.subject || 'No Subject'))];
            
            console.log(`      📁 DB Thread ${dbThreadId}:`);
            console.log(`         - Emails: ${threadEmails.length} (${labelTypes.join(', ')})`);
            console.log(`         - Subjects: ${subjects.slice(0, 2).join(', ')}${subjects.length > 2 ? '...' : ''}`);
            console.log(`         - Thread Subject: "${threadEmails[0].thread.subject}"`);
          }
          console.log('');
        } else if (emails.length > 1) {
          // Check if this thread has mixed label types (good case)
          const labelTypes = [...new Set(emails.map(e => e.labelType))];
          if (labelTypes.length > 1) {
            console.log(`   ✅ GOOD - Gmail thread ${gmailThreadId} properly grouped with mixed labels (${labelTypes.join(', ')})`);
          }
        }
      }
      
      console.log(`   📊 Summary for ${account.email}:`);
      console.log(`      - Total conversations: ${totalConversations}`);
      console.log(`      - Threading issues: ${issueCount}`);
      
      if (issueCount > 0) {
        console.log(`      🚨 ${issueCount} conversations are improperly split across multiple database threads`);
        console.log(`      📌 This explains why you see separate entries instead of grouped conversations`);
      } else {
        console.log(`      ✅ All conversations are properly threaded`);
      }
    }
    
    console.log('\n🎯 ROOT CAUSE ANALYSIS:');
    console.log('   If threading issues were found above, the problem is in email sync logic:');
    console.log('   1. Gmail threads are processed separately for INBOX and SENT');
    console.log('   2. This creates separate database Thread records instead of grouping them');
    console.log('   3. Result: Same conversation appears as multiple separate threads');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   Modify emailSyncService.js to group emails by Gmail threadId BEFORE creating database threads,');
    console.log('   regardless of labelType (INBOX/SENT)');

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the analysis
if (require.main === module) {
  analyzeThreadGrouping().catch(console.error);
}

module.exports = { analyzeThreadGrouping };
