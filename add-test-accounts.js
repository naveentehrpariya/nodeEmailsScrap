const mongoose = require('mongoose');
const Account = require('./db/Account');

const testAccounts = [
    {
        email: 'naveendev@crossmilescarrier.com',
        password: 'test123',  // This will be hashed by the model
        isActive: true,
        syncEnabled: true
    }
];

async function addTestAccounts() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/email-threads');
        
        console.log('🗑️ Removing existing accounts...');
        await Account.deleteMany({});
        
        console.log('➕ Adding test accounts...');
        
        for (const accountData of testAccounts) {
            const account = new Account(accountData);
            await account.save();
            console.log(`✅ Added account: ${accountData.email}`);
        }
        
        console.log('🎉 Test accounts added successfully!');
        await mongoose.disconnect();
        
    } catch (error) {
        console.error('❌ Error adding test accounts:', error);
        process.exit(1);
    }
}

addTestAccounts();
