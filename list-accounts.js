#!/usr/bin/env node

const mongoose = require('mongoose');
const Account = require('./db/Account');
require('dotenv').config();

async function listAccounts() {
  try {
    const dbUri = process.env.DB_URL_OFFICE || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap';
    await mongoose.connect(dbUri);
    console.log('Connected to database:', dbUri);

    const accounts = await Account.find({}).select('email createdAt lastSync');
    
    console.log(`\nFound ${accounts.length} accounts:\n`);
    
    accounts.forEach((account, index) => {
      console.log(`${index + 1}. Email: ${account.email}`);
      console.log(`   ID: ${account._id}`);
      console.log(`   Created: ${account.createdAt || 'N/A'}`);
      console.log(`   Last Sync: ${account.lastSync || 'Never'}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

listAccounts().catch(console.error);
