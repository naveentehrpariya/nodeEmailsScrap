const mongoose = require('mongoose');
const connectDB = require('./db/config');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');
const axios = require('axios');

async function debugFrontendSubject() {
    console.log('🔍 Debugging Frontend Subject Issue...');
    
    try {
        // Connect to database
        await connectDB();
        
        // First find the account
        console.log('\n1. Finding account:');
        const account = await Account.findOne(
            { email: 'naveen@internetbusinesssolutionsindia.com' }
        );
        
        if (!account) {
            console.log('❌ Account not found!');
            return;
        }
        
        console.log('✅ Account found:', account._id);
        
        // Get one thread with its emails
        console.log('\n2. Checking Thread collection directly:');
        const thread = await Thread.findOne({ account: account._id });
        
        if (thread) {
            console.log('Thread subject from DB:', thread.subject);
            console.log('Thread threadId:', thread.threadId);
            console.log('Thread emails count:', thread.emails?.length || 0);
            
            if (thread.emails && thread.emails.length > 0) {
                // Check the emails in this thread
                console.log('\n3. Checking emails in this thread:');
                const emails = await Email.find(
                    { '_id': { $in: thread.emails } },
                    { subject: 1, messageId: 1, gmailMessageId: 1 }
                ).limit(5);
                
                console.log('Email subjects found:');
                emails.forEach((email, i) => {
                    console.log(`  Email ${i+1}: "${email.subject}"`);
                });
            }
        } else {
            console.log('❌ No thread found for this account');
        }
        
    } catch (error) {
        console.error('Database error:', error.message);
    }
    
    // Now test the API endpoint
    console.log('\n4. Testing API endpoint:');
    try {
        const response = await axios.get('http://localhost:8080/accounts/naveen@internetbusinesssolutionsindia.com/threads?labelType=INBOX&limit=1');
        const data = response.data;
        
        console.log('API Response status:', data.status);
        if (data.status === true && data.data.threads.length > 0) {
            const firstThread = data.data.threads[0];
            console.log('API Thread subject:', firstThread.subject);
            console.log('API Thread email count:', firstThread.emailCount);
            console.log('API Full thread data keys:', Object.keys(firstThread));
        } else {
            console.log('API returned no threads or error:', data);
        }
        
    } catch (apiError) {
        console.error('API test failed:', apiError.message);
    } finally {
        process.exit(0);
    }
}

debugFrontendSubject().catch(console.error);
