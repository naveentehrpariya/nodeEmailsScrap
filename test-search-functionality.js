#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
require('dotenv').config();

async function testSearchFunctionality() {
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

    // Test scenarios
    const testCases = [
      {
        name: 'Test INBOX without search',
        labelType: 'INBOX',
        searchQuery: null
      },
      {
        name: 'Test SENT without search',
        labelType: 'SENT',
        searchQuery: null
      },
      {
        name: 'Test ALL without search',
        labelType: 'ALL',
        searchQuery: null
      },
      {
        name: 'Test INBOX with email search',
        labelType: 'INBOX',
        searchQuery: 'crossmiles'
      },
      {
        name: 'Test SENT with sender search',
        labelType: 'SENT',
        searchQuery: 'naveendev'
      },
      {
        name: 'Test ALL with general search',
        labelType: 'ALL',
        searchQuery: 'email'
      }
    ];

    for (const testCase of testCases) {
      console.log(`\n🧪 ${testCase.name}...`);
      
      try {
        const results = await testSearchQuery(account._id, testCase.labelType, testCase.searchQuery);
        console.log(`   📊 Results: ${results.threads.length} threads, ${results.total} total count`);
        
        if (results.threads.length > 0) {
          console.log(`   📧 First thread: ${results.threads[0].subject || 'No subject'}`);
          console.log(`   📅 Latest email: ${results.threads[0].latestEmailDate}`);
          console.log(`   📮 Email count in thread: ${results.threads[0].emailCount}`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error in ${testCase.name}:`, error.message);
      }
    }

    // Test performance with a common search term
    console.log('\n⏱️  Performance test with common search term...');
    const startTime = Date.now();
    const performanceResults = await testSearchQuery(account._id, 'ALL', 'the');
    const endTime = Date.now();
    console.log(`   📊 Found ${performanceResults.threads.length} threads in ${endTime - startTime}ms`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

// Simulate the enhanced search functionality
async function testSearchQuery(accountId, labelType, searchQuery) {
  const page = 1;
  const limit = 10;
  
  // Create search regex if search query is provided
  let searchRegex = null;
  if (searchQuery && searchQuery.trim()) {
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchRegex = new RegExp(escapedQuery, 'i');
  }

  let results;
  let totalFilteredCount;

  if (labelType.toUpperCase() === 'ALL') {
    // Handle ALL tab - fetch threads with emails from both INBOX and SENT
    results = await getAllTabThreads(accountId, searchRegex, page, limit);
    totalFilteredCount = await getTotalCountAllTab(accountId, searchRegex);
  } else {
    // Handle specific label type (INBOX or SENT)
    results = await getSpecificLabelThreads(accountId, labelType.toUpperCase(), searchRegex, page, limit);
    totalFilteredCount = await getTotalCountSpecificLabel(accountId, labelType.toUpperCase(), searchRegex);
  }

  return {
    threads: results,
    total: totalFilteredCount
  };
}

// Helper function to get threads for ALL tab
async function getAllTabThreads(accountId, searchRegex, page, limit) {
  // Base pipeline for ALL tab - combines INBOX and SENT
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
                  { $in: ['$labelType', ['INBOX', 'SENT']] },
                  { $eq: ['$deletedAt', null] }
                ]
              }
            }
          },
          // Add search filter if provided
          ...(searchRegex ? [{
            $match: {
              $or: [
                { gmailMessageId: searchRegex },
                { from: searchRegex },
                { to: searchRegex },
                { subject: searchRegex },
                { textBlocks: { $elemMatch: { $regex: searchRegex } } }
              ]
            }
          }] : []),
          { $sort: { createdAt: -1 } }
        ],
        as: 'emails'
      }
    },
    { $match: { 'emails.0': { $exists: true } } },
    { 
      $addFields: { 
        emailCount: { $size: '$emails' },
        latestEmailDate: { $max: '$emails.createdAt' },
        // Get preview emails (first 3)
        emails: { $slice: ['$emails', 3] }
      }
    },
    { $sort: { latestEmailDate: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: parseInt(limit) }
  ];

  return await Thread.aggregate(pipeline);
}

// Helper function to get threads for specific label type
async function getSpecificLabelThreads(accountId, labelType, searchRegex, page, limit) {
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
                  { $eq: ['$labelType', labelType] },
                  { $eq: ['$deletedAt', null] }
                ]
              }
            }
          },
          // Add search filter if provided
          ...(searchRegex ? [{
            $match: {
              $or: [
                { gmailMessageId: searchRegex },
                { from: searchRegex },
                { to: searchRegex },
                { subject: searchRegex },
                { textBlocks: { $elemMatch: { $regex: searchRegex } } }
              ]
            }
          }] : []),
          { $sort: { createdAt: -1 } }
        ],
        as: 'emails'
      }
    },
    { $match: { 'emails.0': { $exists: true } } },
    { 
      $addFields: { 
        emailCount: { $size: '$emails' },
        latestEmailDate: { $max: '$emails.createdAt' },
        // Get preview emails (first 3)
        emails: { $slice: ['$emails', 3] }
      }
    },
    { $sort: { latestEmailDate: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: parseInt(limit) }
  ];

  return await Thread.aggregate(pipeline);
}

// Helper function to get total count for ALL tab
async function getTotalCountAllTab(accountId, searchRegex) {
  const countPipeline = [
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
                  { $in: ['$labelType', ['INBOX', 'SENT']] },
                  { $eq: ['$deletedAt', null] }
                ]
              }
            }
          },
          // Add search filter if provided
          ...(searchRegex ? [{
            $match: {
              $or: [
                { gmailMessageId: searchRegex },
                { from: searchRegex },
                { to: searchRegex },
                { subject: searchRegex },
                { textBlocks: { $elemMatch: { $regex: searchRegex } } }
              ]
            }
          }] : [])
        ],
        as: 'emails'
      }
    },
    { $match: { 'emails.0': { $exists: true } } },
    { $count: 'total' }
  ];

  const result = await Thread.aggregate(countPipeline);
  return result.length > 0 ? result[0].total : 0;
}

// Helper function to get total count for specific label
async function getTotalCountSpecificLabel(accountId, labelType, searchRegex) {
  const countPipeline = [
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
                  { $eq: ['$labelType', labelType] },
                  { $eq: ['$deletedAt', null] }
                ]
              }
            }
          },
          // Add search filter if provided
          ...(searchRegex ? [{
            $match: {
              $or: [
                { gmailMessageId: searchRegex },
                { from: searchRegex },
                { to: searchRegex },
                { subject: searchRegex },
                { textBlocks: { $elemMatch: { $regex: searchRegex } } }
              ]
            }
          }] : [])
        ],
        as: 'emails'
      }
    },
    { $match: { 'emails.0': { $exists: true } } },
    { $count: 'total' }
  ];

  const result = await Thread.aggregate(countPipeline);
  return result.length > 0 ? result[0].total : 0;
}

testSearchFunctionality().catch(console.error);
