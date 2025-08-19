require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/config');
const Account = require('./db/Account');
const Thread = require('./db/Thread');

async function directApiTest() {
    console.log('🔍 Direct API test for subjects...');
    
    try {
        await connectDB();
        
        console.log('\n1. Finding account...');
        const account = await Account.findOne({ 
            email: 'naveendev@crossmilescarrier.com'
        }).lean();
        
        if (!account) {
            console.log('❌ Account not found!');
            return;
        }
        
        console.log('✅ Account found:', account.email);
        
        console.log('\n2. Finding threads...');
        const threads = await Thread.find({ 
            account: account._id
        }).limit(3).lean();
        
        console.log(`Found ${threads.length} threads:`);
        threads.forEach((thread, i) => {
            console.log(`  ${i+1}. Subject: "${thread.subject}"`);
        });
        
        // Now simulate the API response structure
        console.log('\n3. Simulating API response structure...');
        const apiResponse = {
            status: true,
            data: {
                account: account,
                threads: threads,
                pagination: { page: 1, limit: 20, total: threads.length, pages: 1 }
            }
        };
        
        console.log('First thread subject from API response:', apiResponse.data.threads[0]?.subject);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        process.exit(0);
    }
}

directApiTest();
