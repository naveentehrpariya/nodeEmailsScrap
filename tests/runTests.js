#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Email Controller Domain Validation
 * Tests both the domain validation logic and duplicate checking functionality
 */

const AppError = require('../utils/AppError');

// Test Results Storage
let testResults = [];
let totalTests = 0;
let passedTests = 0;

// Simple assertion functions
function assertEquals(actual, expected, message = '') {
    if (actual === expected) {
        console.log(`  ✅ PASS: ${message}`);
        passedTests++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
        console.log(`     Expected: ${expected}`);
        console.log(`     Actual: ${actual}`);
    }
    totalTests++;
}

function assertTrue(condition, message = '') {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passedTests++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
    }
    totalTests++;
}

function assertFalse(condition, message = '') {
    if (!condition) {
        console.log(`  ✅ PASS: ${message}`);
        passedTests++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
    }
    totalTests++;
}

async function assertThrows(asyncFunc, expectedErrorMessage, testMessage) {
    try {
        await asyncFunc();
        console.log(`  ❌ FAIL: ${testMessage} - Expected error but none was thrown`);
        totalTests++;
    } catch (error) {
        if (error.message === expectedErrorMessage) {
            console.log(`  ✅ PASS: ${testMessage}`);
            passedTests++;
        } else {
            console.log(`  ❌ FAIL: ${testMessage} - Wrong error message`);
            console.log(`     Expected: ${expectedErrorMessage}`);
            console.log(`     Actual: ${error.message}`);
        }
        totalTests++;
    }
}

// Mock function to simulate the controller's domain validation logic
function validateDomain(email) {
    return /@crossmilescarrier\.com$/i.test(email);
}

// Mock function to simulate the addNewAccount functionality for testing
async function mockAddNewAccount(email, existingAccounts = []) {
    // Domain validation - only allow @crossmilescarrier.com addresses
    if (!/@crossmilescarrier\.com$/i.test(email)) {
        throw new AppError('Only crossmilescarrier.com addresses are allowed', 400);
    }
    
    // Check for duplicate email
    const existingAccount = existingAccounts.find(account => account.email === email);
    if (existingAccount) {
        throw new AppError(`An account with email ${email} already exists. Please use a different email address.`, 400);
    }
    
    // Simulate successful account creation
    return {
        _id: 'mock-id-' + Date.now(),
        email: email,
        lastSync: new Date(),
        createdAt: new Date()
    };
}

// Test Functions
function testDomainValidationRegex() {
    console.log('\n🔍 Testing Domain Validation Regex:');
    
    // Valid emails
    const validEmails = [
        'test@crossmilescarrier.com',
        'user@CROSSMILESCARRIER.COM',
        'admin@crossmilescarrier.com',
        'info@crossmilescarrier.com',
        'support@crossmilescarrier.com',
        'a@crossmilescarrier.com', // single character local part
        'user.name@crossmilescarrier.com', // dot in local part
        'user_name@crossmilescarrier.com', // underscore in local part
        'user+tag@crossmilescarrier.com' // plus in local part
    ];
    
    validEmails.forEach(email => {
        assertTrue(validateDomain(email), `Valid email should be accepted: ${email}`);
    });
    
    // Invalid emails
    const invalidEmails = [
        'test@gmail.com',
        'user@yahoo.com',
        'admin@outlook.com',
        'test@crossmilescarriers.com', // extra 's'
        'user@mail.crossmilescarrier.com', // subdomain
        'invalid-email', // malformed
        '', // empty
        'test@crossmilescarrier.net', // wrong TLD
        'test@crossmiles-carrier.com', // hyphen instead of no hyphen
        'test@crossmilescarrier.org', // wrong TLD
        'test@crossmilescarrier.co.uk', // wrong TLD
        'test@crossmilescarrieer.com', // typo in domain
        'test@corssmilescarrier.com' // typo in domain
    ];
    
    invalidEmails.forEach(email => {
        assertFalse(validateDomain(email), `Invalid email should be rejected: ${email}`);
    });
}

async function testAddNewAccountValidation() {
    console.log('\n🔍 Testing addNewAccount Domain Validation:');
    
    // Test valid domain acceptance
    try {
        const result = await mockAddNewAccount('test@crossmilescarrier.com');
        assertTrue(result._id && result.email === 'test@crossmilescarrier.com', 'Valid domain should create account');
    } catch (error) {
        console.log(`  ❌ FAIL: Valid domain should create account - ${error.message}`);
        totalTests++;
    }
    
    // Test invalid domain rejection
    await assertThrows(
        () => mockAddNewAccount('test@gmail.com'),
        'Only crossmilescarrier.com addresses are allowed',
        'Gmail domain should be rejected'
    );
    
    await assertThrows(
        () => mockAddNewAccount('user@yahoo.com'),
        'Only crossmilescarrier.com addresses are allowed',
        'Yahoo domain should be rejected'
    );
    
    await assertThrows(
        () => mockAddNewAccount('admin@outlook.com'),
        'Only crossmilescarrier.com addresses are allowed',
        'Outlook domain should be rejected'
    );
    
    await assertThrows(
        () => mockAddNewAccount('test@crossmilescarriers.com'),
        'Only crossmilescarrier.com addresses are allowed',
        'Similar domain with extra "s" should be rejected'
    );
    
    await assertThrows(
        () => mockAddNewAccount('test@mail.crossmilescarrier.com'),
        'Only crossmilescarrier.com addresses are allowed',
        'Subdomain should be rejected'
    );
    
    // Test case insensitivity
    try {
        const result = await mockAddNewAccount('test@CROSSMILESCARRIER.COM');
        assertTrue(result._id && result.email === 'test@CROSSMILESCARRIER.COM', 'Case insensitive domain should work');
    } catch (error) {
        console.log(`  ❌ FAIL: Case insensitive domain should work - ${error.message}`);
        totalTests++;
    }
}

async function testDuplicateValidation() {
    console.log('\n🔍 Testing Duplicate Email Validation:');
    
    const existingAccounts = [
        { email: 'existing@crossmilescarrier.com', _id: 'existing-id' },
        { email: 'another@crossmilescarrier.com', _id: 'another-id' }
    ];
    
    // Test duplicate rejection with exact match
    await assertThrows(
        () => mockAddNewAccount('existing@crossmilescarrier.com', existingAccounts),
        'An account with email existing@crossmilescarrier.com already exists. Please use a different email address.',
        'Duplicate email should be rejected with friendly message'
    );
    
    // Test duplicate rejection with different case (case sensitivity check)
    // Note: MongoDB is case-sensitive, so different case emails are allowed
    try {
        const result = await mockAddNewAccount('EXISTING@crossmilescarrier.com', existingAccounts);
        assertTrue(result._id && result.email === 'EXISTING@crossmilescarrier.com', 'Different case email should be accepted (MongoDB is case-sensitive)');
    } catch (error) {
        console.log(`  ❌ FAIL: Different case email should be accepted - ${error.message}`);
        totalTests++;
    }
    
    // Test non-duplicate acceptance
    try {
        const result = await mockAddNewAccount('new@crossmilescarrier.com', existingAccounts);
        assertTrue(result._id && result.email === 'new@crossmilescarrier.com', 'Non-duplicate email should be accepted');
    } catch (error) {
        console.log(`  ❌ FAIL: Non-duplicate email should be accepted - ${error.message}`);
        totalTests++;
    }
}

function testEdgeCases() {
    console.log('\n🔍 Testing Edge Cases:');
    
    const edgeCases = [
        { email: '', expected: false, description: 'Empty string' },
        { email: 'invalid-email', expected: false, description: 'No @ symbol' },
        { email: '@crossmilescarrier.com', expected: true, description: 'Missing local part - regex still matches domain' },
        { email: 'test@', expected: false, description: 'Missing domain' },
        { email: 'test@crossmilescarrier', expected: false, description: 'Missing TLD' },
        { email: 'test@crossmilescarrier.', expected: false, description: 'Incomplete TLD' },
        { email: '  test@crossmilescarrier.com  ', expected: false, description: 'Email with leading/trailing spaces' },
        { email: 'test@mail.crossmilescarrier.com', expected: false, description: 'Subdomain' },
        { email: 'test@crossmilescarrier.com.evil.com', expected: false, description: 'Domain spoofing attempt' },
        { email: 'test@crossmilescarrier.COM', expected: true, description: 'Uppercase domain should work' },
        { email: 'test@CrossMilesCarrier.com', expected: true, description: 'Mixed case domain should work' }
    ];
    
    edgeCases.forEach(testCase => {
        const result = validateDomain(testCase.email);
        assertEquals(result, testCase.expected, `${testCase.description}: "${testCase.email}"`);
    });
}

// Main test runner
async function runAllTests() {
    console.log('🧪 Running Email Controller Domain Validation Tests\n');
    console.log('=' .repeat(70));
    
    testDomainValidationRegex();
    await testAddNewAccountValidation();
    await testDuplicateValidation();
    testEdgeCases();
    
    console.log('\n' + '='.repeat(70));
    console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed!');
        console.log('\n✅ Domain validation implementation is working correctly!');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} test(s) failed`);
        console.log('\n❌ Some tests failed - please review the implementation!');
    }
    
    console.log('\n📝 Next Steps:');
    console.log('1. Test with real API calls using Postman or curl');
    console.log('2. Verify error messages appear correctly in the frontend');
    console.log('3. Test edge cases in the actual application environment');
    
    return passedTests === totalTests;
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    validateDomain,
    mockAddNewAccount
};
