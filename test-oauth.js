#!/usr/bin/env node

const oauthValidator = require('./utils/oauthValidator');

async function testOAuth() {
    const email = process.argv[2] || 'naveen@internetbusinesssolutionsindia.com';
    
    console.log(`🧪 Testing OAuth for: ${email}\n`);
    
    try {
        const result = await oauthValidator.validateConfiguration(email);
        
        if (result) {
            console.log('\n🎉 SUCCESS: OAuth configuration is working correctly!');
            console.log('✅ You can now sync emails for this account.');
        } else {
            console.log('\n❌ FAILED: OAuth configuration needs to be fixed.');
            console.log('📋 Follow the steps above to configure domain-wide delegation.');
        }
    } catch (error) {
        console.error('🚨 Test failed:', error.message);
    }
}

testOAuth();
