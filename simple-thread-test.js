require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/config');
const Account = require('./db/Account');
const Thread = require('./db/Thread');

async function simpleThreadTest() {
    console.log('🔍 Simple Thread Subject Test...');
    
    try {
        await connectDB();
        
        console.log('\n1. Checking all accounts in database...');
        const allAccounts = await Account.find({}).lean();
        console.log(`Found ${allAccounts.length} accounts:`);
        allAccounts.forEach((acc, i) => {
            console.log(`  ${i+1}. ${acc.email} (ID: ${acc._id})`);
        });
        
        console.log('\n2. Finding specific account...');
        const account = await Account.findOne({ 
            email: 'naveendev@crossmilescarrier.com'
        }).lean();
        
        if (!account) {
            console.log('❌ Specific account not found!');
            return;
        }
        
        console.log('✅ Account found:', account.email, account._id);
        
        console.log('\n2. Finding threads for this account...');
        const threads = await Thread.find({ 
            account: account._id,
            deletedAt: null
        }).limit(5).lean();
        
        console.log(`Found ${threads.length} threads`);
        
        if (threads.length > 0) {
            console.log('\n3. Thread subjects:');
            threads.forEach((thread, i) => {
                console.log(`  Thread ${i+1}: "${thread.subject}" (ID: ${thread._id})`);
                console.log(`    - threadId: ${thread.threadId}`);
                console.log(`    - from: ${thread.from}`);
                console.log(`    - date: ${thread.date}`);
                console.log('');
            });
        } else {
            console.log('❌ No threads found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        process.exit(0);
    }
}

simpleThreadTest();
