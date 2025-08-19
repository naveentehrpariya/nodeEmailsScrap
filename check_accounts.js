require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
const Account = require('./db/Account');

async function checkAccounts() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🔍 Checking account structure...');
        
        const accounts = await Account.find({});
        console.log('Found accounts:', accounts.length);
        
        accounts.forEach((acc, i) => {
            console.log(`Account ${i+1}:`);
            console.log('  Email:', acc.email);
            console.log('  Name:', acc.name);
            console.log('  Has serviceAccount:', !!acc.serviceAccount);
            console.log('  ServiceAccount type:', typeof acc.serviceAccount);
            console.log('  ServiceAccount sample:', acc.serviceAccount ? acc.serviceAccount.substring(0, 100) + '...' : 'null');
            console.log('  Available fields:', Object.keys(acc.toObject()));
        });
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAccounts();
