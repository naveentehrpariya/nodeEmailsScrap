#!/usr/bin/env node

/**
 * Debug script to test the specific thread that's having issues
 * Thread ID: 68ae143153420ff33b8eb7af
 */

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function debugSpecificThread() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('🔗 Connected to database');

    const threadId = '68ae143153420ff33b8eb7af';
    console.log(`🔍 Debugging thread: ${threadId}`);

    // First, let's check if this thread exists
    const thread = await Thread.findOne({ _id: threadId, deletedAt: null }).lean();
    if (!thread) {
      console.log('❌ Thread not found');
      return;
    }

    console.log(`✅ Thread found: "${thread.subject}"`);
    console.log(`   Account: ${thread.account}`);
    console.log(`   Created: ${thread.createdAt}`);

    // Now let's get ALL emails in this thread (this is what getSingleThread should return)
    console.log('\n📧 ALL emails in this thread (what getSingleThread should return):');
    const allEmails = await Email.find({
      thread: threadId,
      deletedAt: null
    })
    .sort({ createdAt: 1, date: 1 })
    .lean();

    console.log(`   Found ${allEmails.length} total emails`);
    
    allEmails.forEach((email, index) => {
      console.log(`   ${index + 1}. [${email.labelType}] From: ${email.from}`);
      console.log(`      To: ${email.to}`);
      console.log(`      Subject: ${email.subject || '(no subject)'}`);
      console.log(`      Date: ${email.date || email.createdAt}`);
      console.log(`      Gmail ID: ${email.gmailMessageId}`);
      console.log('');
    });

    // Check if there are different label types
    const labelTypes = [...new Set(allEmails.map(e => e.labelType))];
    console.log(`📋 Label types in this thread: ${labelTypes.join(', ')}`);
    
    if (labelTypes.length > 1) {
      console.log('✅ This thread has mixed label types - should show in both INBOX and SENT tabs');
    } else {
      console.log(`ℹ️  This thread only has ${labelTypes[0]} emails`);
    }

    // Test our aggregation logic for INBOX tab
    console.log('\n🧪 Testing INBOX tab logic:');
    const inboxResult = await Thread.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(threadId), deletedAt: null } },
      {
        $lookup: {
          from: 'emails',
          let: { threadId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$thread', '$$threadId'] },
                    { $eq: ['$deletedAt', null] }
                  ]
                }
              }
            },
            { $sort: { createdAt: -1 } }
          ],
          as: 'emails'
        }
      },
      {
        $addFields: {
          hasInbox: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'INBOX'] } } } },
          hasSent: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'SENT'] } } } }
        }
      }
    ]);

    if (inboxResult.length > 0) {
      const result = inboxResult[0];
      console.log(`   Has INBOX emails: ${result.hasInbox}`);
      console.log(`   Has SENT emails: ${result.hasSent}`);
      console.log(`   Should appear in INBOX tab: ${result.hasInbox}`);
      console.log(`   Should appear in SENT tab: ${result.hasSent}`);
      console.log(`   Emails returned: ${result.emails.length}`);
      
      console.log(`\n📋 Emails in aggregation result:`);
      result.emails.forEach((email, index) => {
        console.log(`   ${index + 1}. [${email.labelType}] From: ${email.from}`);
      });
    }

    // Let's also simulate the exact getSingleThread API call
    console.log('\n🔧 Simulating getSingleThread API call:');
    
    const threadWithAccount = await Thread.findOne({
      _id: threadId,
      deletedAt: null
    }).populate('account').lean();
    
    if (threadWithAccount) {
      const emails = await Email.find({
        thread: threadId,
        deletedAt: null
      })
      .sort({ createdAt: 1, date: 1 })
      .lean();
      
      console.log(`✅ API would return ${emails.length} emails`);
      console.log(`   Thread subject: ${threadWithAccount.subject}`);
      console.log(`   Account: ${threadWithAccount.account?.email || 'No account'}`);
      
      // This is exactly what the API returns
      const apiResponse = {
        status: true,
        message: "Thread fetched successfully",
        data: {
          ...threadWithAccount,
          emails: emails
        }
      };
      
      console.log(`\n📤 Full API response structure:`);
      console.log(`   status: ${apiResponse.status}`);
      console.log(`   data.emails.length: ${apiResponse.data.emails.length}`);
      console.log(`   data.emails[0].labelType: ${apiResponse.data.emails[0]?.labelType}`);
      console.log(`   data.emails[last].labelType: ${apiResponse.data.emails[apiResponse.data.emails.length-1]?.labelType}`);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the debug
if (require.main === module) {
  debugSpecificThread().catch(console.error);
}

module.exports = { debugSpecificThread };
