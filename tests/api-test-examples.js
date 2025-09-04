#!/usr/bin/env node

/**
 * API Test Examples for Domain Validation
 * 
 * This script provides curl commands and Node.js examples to test
 * the domain validation functionality of the addNewAccount endpoint.
 * 
 * Usage: node api-test-examples.js
 * 
 * Prerequisites:
 * - Backend server running on localhost:8080
 * - Valid JWT authentication token
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    baseUrl: process.env.APP_URL || 'http://localhost:8080',
    // Replace with your actual JWT token
    authToken: process.env.JWT_TOKEN || 'your-jwt-token-here'
};

// Helper function to make API requests
async function testAPI(endpoint, method = 'POST', data = null) {
    try {
        const config = {
            method,
            url: `${CONFIG.baseUrl}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${CONFIG.authToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            config.data = data;
        }
        
        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data || error.message,
            status: error.response?.status
        };
    }
}

// Test functions
async function testValidDomains() {
    console.log('\n🧪 Testing Valid Domains:');
    
    const validEmails = [
        'test@crossmilescarrier.com',
        'admin@CROSSMILESCARRIER.COM',
        'support@crossmilescarrier.com'
    ];
    
    for (const email of validEmails) {
        console.log(`\n🔹 Testing: ${email}`);
        const result = await testAPI('/account/add', 'POST', { email });
        
        if (result.success) {
            console.log(`  ✅ SUCCESS: ${result.data.message}`);
        } else {
            console.log(`  ❌ FAILED: ${result.error.message || result.error}`);
        }
    }
}

async function testInvalidDomains() {
    console.log('\n🚫 Testing Invalid Domains:');
    
    const invalidEmails = [
        'test@gmail.com',
        'user@yahoo.com',
        'admin@outlook.com',
        'test@crossmilescarriers.com',
        'user@mail.crossmilescarrier.com'
    ];
    
    for (const email of invalidEmails) {
        console.log(`\n🔹 Testing: ${email}`);
        const result = await testAPI('/account/add', 'POST', { email });
        
        if (!result.success && result.error.message === 'Only crossmilescarrier.com addresses are allowed') {
            console.log(`  ✅ CORRECTLY REJECTED: ${result.error.message}`);
        } else if (result.success) {
            console.log(`  ❌ ERROR: Should have been rejected but was accepted`);
        } else {
            console.log(`  ❌ UNEXPECTED ERROR: ${result.error.message || result.error}`);
        }
    }
}

async function testDuplicateEmails() {
    console.log('\n🔄 Testing Duplicate Email Handling:');
    
    const testEmail = `test-duplicate@crossmilescarrier.com`;
    
    console.log(`\n🔹 First attempt with: ${testEmail}`);
    const firstResult = await testAPI('/account/add', 'POST', { email: testEmail });
    
    if (firstResult.success) {
        console.log(`  ✅ FIRST SUCCESS: ${firstResult.data.message}`);
        
        console.log(`\n🔹 Second attempt with same email: ${testEmail}`);
        const secondResult = await testAPI('/account/add', 'POST', { email: testEmail });
        
        if (!secondResult.success && secondResult.error.message?.includes('already exists')) {
            console.log(`  ✅ CORRECTLY REJECTED DUPLICATE: ${secondResult.error.message}`);
        } else if (secondResult.success) {
            console.log(`  ❌ ERROR: Duplicate should have been rejected`);
        } else {
            console.log(`  ❌ UNEXPECTED ERROR: ${secondResult.error.message || secondResult.error}`);
        }
    } else {
        console.log(`  ❌ FIRST ATTEMPT FAILED: ${firstResult.error.message || firstResult.error}`);
    }
}

// Generate curl commands for manual testing
function generateCurlCommands() {
    console.log('\n📋 Curl Commands for Manual Testing:');
    console.log('\n(Replace YOUR_JWT_TOKEN with your actual token)');
    
    console.log('\n✅ Valid Domain Test:');
    console.log(`curl -X POST http://localhost:8080/account/add \\`);
    console.log(`  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email": "test@crossmilescarrier.com"}'`);
    
    console.log('\n❌ Invalid Domain Test:');
    console.log(`curl -X POST http://localhost:8080/account/add \\`);
    console.log(`  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email": "test@gmail.com"}'`);
    
    console.log('\n🔄 Duplicate Email Test (run twice):');
    console.log(`curl -X POST http://localhost:8080/account/add \\`);
    console.log(`  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email": "duplicate@crossmilescarrier.com"}'`);
}

// Main function
async function runAPITests() {
    console.log('🔧 Email Controller Domain Validation API Tests');
    console.log('=' .repeat(60));
    
    console.log('\n⚠️  Note: Make sure your backend server is running on localhost:8080');
    console.log('⚠️  Note: Update CONFIG.authToken with a valid JWT token');
    
    if (CONFIG.authToken === 'your-jwt-token-here') {
        console.log('\n❌ Please set a valid JWT token in CONFIG.authToken or JWT_TOKEN environment variable');
        console.log('   Example: JWT_TOKEN="your-actual-token" node tests/api-test-examples.js');
        generateCurlCommands();
        return;
    }
    
    try {
        await testValidDomains();
        await testInvalidDomains();
        await testDuplicateEmails();
    } catch (error) {
        console.error('\n❌ API Test Error:', error.message);
        console.log('\nTrying to connect to:', CONFIG.baseUrl);
        console.log('Make sure the backend server is running.');
    }
    
    generateCurlCommands();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📝 Testing Complete!');
    console.log('\nFor frontend testing:');
    console.log('1. Open the application in your browser');
    console.log('2. Navigate to "Add New Email" page');
    console.log('3. Try adding valid emails (@crossmilescarrier.com)');
    console.log('4. Try adding invalid emails (gmail.com, yahoo.com, etc.)');
    console.log('5. Verify error messages display correctly in the UI');
}

if (require.main === module) {
    runAPITests();
}

module.exports = {
    testAPI,
    CONFIG
};
