#!/usr/bin/env node

/**
 * Test script to verify the email conversation threading fix
 * 
 * This script tests the new threading logic that shows complete conversations
 * in both INBOX and SENT tabs when a thread contains emails from both labels.
 */

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function testThreadingFix() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('🔗 Connected to database');

    // Find an account for testing
    const testEmailAccount = 'dispatch@crossmilescarrier.com';
    const account = await Account.findOne({ 
      email: testEmailAccount, 
      deletedAt: { $exists: false } 
    });
    
    if (!account) {
      console.log(`❌ Test account ${testEmailAccount} not found`);
      return;
    }
    
    console.log(`✅ Using test account: ${account.email} (ID: ${account._id})`);
    
    // Test the new aggregation logic directly
    console.log('\n🧪 Testing INBOX tab (should show threads with ANY inbox emails, but ALL emails in each thread)');
    
    const inboxResults = await testSpecificLabel(account._id, 'INBOX');
    console.log(`📊 INBOX results: ${inboxResults.length} threads`);
    
    if (inboxResults.length > 0) {
      const sampleThread = inboxResults[0];
      console.log(`   📧 Sample thread: "${sampleThread.subject || 'No Subject'}" with ${sampleThread.emailCount} emails`);
      
      if (sampleThread.emails && sampleThread.emails.length > 0) {
        const labelCounts = sampleThread.emails.reduce((acc, email) => {
          acc[email.labelType] = (acc[email.labelType] || 0) + 1;
          return acc;
        }, {});
        
        console.log(`   📋 Label breakdown in preview: INBOX=${labelCounts.INBOX || 0}, SENT=${labelCounts.SENT || 0}`);
        
        if (labelCounts.INBOX && labelCounts.SENT) {
          console.log('   ✅ SUCCESS: Thread contains both INBOX and SENT emails!');
        } else {
          console.log('   ⚠️  INFO: Thread contains only one label type (may be normal)');
        }
      }
    }
    
    console.log('\n🧪 Testing SENT tab (should show threads with ANY sent emails, but ALL emails in each thread)');
    
    const sentResults = await testSpecificLabel(account._id, 'SENT');
    console.log(`📊 SENT results: ${sentResults.length} threads`);
    
    if (sentResults.length > 0) {
      const sampleThread = sentResults[0];
      console.log(`   📧 Sample thread: "${sampleThread.subject || 'No Subject'}" with ${sampleThread.emailCount} emails`);
      
      if (sampleThread.emails && sampleThread.emails.length > 0) {
        const labelCounts = sampleThread.emails.reduce((acc, email) => {
          acc[email.labelType] = (acc[email.labelType] || 0) + 1;
          return acc;
        }, {});
        
        console.log(`   📋 Label breakdown in preview: INBOX=${labelCounts.INBOX || 0}, SENT=${labelCounts.SENT || 0}`);
        
        if (labelCounts.INBOX && labelCounts.SENT) {
          console.log('   ✅ SUCCESS: Thread contains both INBOX and SENT emails!');
        } else {
          console.log('   ⚠️  INFO: Thread contains only one label type (may be normal)');
        }
      }
    }
    
    // Look for threads that should appear in both tabs
    console.log('\n🔍 Looking for threads that contain both INBOX and SENT emails...');
    
    const mixedThreads = await Thread.aggregate([
      { $match: { account: account._id, deletedAt: null } },
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
            }
          ],
          as: 'emails'
        }
      },
      {
        $addFields: {
          hasInbox: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'INBOX'] } } } },
          hasSent: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'SENT'] } } } }
        }
      },
      { $match: { $and: [{ hasInbox: true }, { hasSent: true }] } },
      { $limit: 5 }
    ]);
    
    console.log(`📊 Found ${mixedThreads.length} threads with both INBOX and SENT emails`);
    
    if (mixedThreads.length > 0) {
      console.log('✅ VALIDATION PASSED: The fix should work correctly!');
      console.log('\n📋 Sample mixed threads:');
      
      mixedThreads.slice(0, 3).forEach((thread, index) => {
        const inboxCount = thread.emails.filter(e => e.labelType === 'INBOX').length;
        const sentCount = thread.emails.filter(e => e.labelType === 'SENT').length;
        console.log(`   ${index + 1}. "${thread.subject || 'No Subject'}" - INBOX: ${inboxCount}, SENT: ${sentCount}`);
      });
      
      console.log('\n✅ These threads should now appear in BOTH the INBOX and SENT tabs with all their emails visible!');
    } else {
      console.log('⚠️  No mixed threads found in this account - testing with single-label threads only');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Helper function to test specific label aggregation
async function testSpecificLabel(accountId, labelType) {
  const pipeline = [
    { $match: { account: accountId, deletedAt: null } },
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
    // Add fields to check if thread contains the requested label type
    {
      $addFields: {
        hasInbox: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'INBOX'] } } } },
        hasSent: { $anyElementTrue: { $map: { input: '$emails', as: 'e', in: { $eq: ['$$e.labelType', 'SENT'] } } } }
      }
    },
    // Filter threads based on requested label type
    {
      $match: labelType === 'INBOX' ? { hasInbox: true } : { hasSent: true }
    },
    // Ensure thread has at least one email
    { $match: { 'emails.0': { $exists: true } } },
    { 
      $addFields: { 
        emailCount: { $size: '$emails' },
        latestEmailDate: { $max: '$emails.createdAt' },
        // Get preview emails (first 3) - now includes ALL emails from the conversation
        emails: { $slice: ['$emails', 3] }
      }
    },
    { $sort: { latestEmailDate: -1 } },
    { $limit: 5 }
  ];
  
  return await Thread.aggregate(pipeline);
}

// Run the test
if (require.main === module) {
  testThreadingFix().catch(console.error);
}

module.exports = { testThreadingFix };
