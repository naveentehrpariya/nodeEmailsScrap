#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function testAggregation() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    const targetEmail = 'naveendev@crossmilescarrier.com';
    const account = await Account.findOne({ email: targetEmail, deletedAt: null });
    
    console.log('✅ Account found:', account.email);
    console.log('   Account ID:', account._id);

    // Test the aggregation pipeline
    const labelType = 'INBOX';
    const page = 1;
    const limit = 10;
    
    const pipeline = [
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
                    { $eq: ['$labelType', labelType.toUpperCase()] },
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
      { $match: { 'emails.0': { $exists: true } } },
      { $addFields: { emailCount: { $size: '$emails' }, latestEmailDate: { $max: '$emails.createdAt' } } },
      { $sort: { latestEmailDate: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ];

    console.log('\n🔍 Testing aggregation pipeline...');
    const results = await Thread.aggregate(pipeline);
    console.log(`📂 Found ${results.length} threads with ${labelType} emails`);

    if (results.length > 0) {
      console.log('\n📋 Sample results:');
      results.slice(0, 3).forEach((thread, index) => {
        console.log(`   ${index + 1}. Thread: ${thread.subject || 'No subject'}`);
        console.log(`      Created: ${thread.createdAt}`);
        console.log(`      Latest email: ${thread.latestEmailDate}`);
        console.log(`      Email count: ${thread.emailCount}`);
        console.log(`      First email subject: ${thread.emails[0]?.subject || 'No subject'}`);
        console.log('');
      });
    }

    // Check the total count
    const countPipeline = [
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
                    { $eq: ['$labelType', labelType.toUpperCase()] },
                    { $eq: ['$deletedAt', null] }
                  ]
                }
              }
            }
          ],
          as: 'emails'
        }
      },
      { $match: { 'emails.0': { $exists: true } } },
      { $count: 'total' }
    ];

    const countResult = await Thread.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;
    console.log(`📊 Total threads with ${labelType} emails: ${total}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

testAggregation().catch(console.error);
