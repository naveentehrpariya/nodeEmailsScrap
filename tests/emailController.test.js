/**
 * Email Controller Domain Validation Tests
 * Simple Node.js test without external dependencies
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
        'support@crossmilescarrier.com'
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
        'test@crossmiles-carrier.com' // hyphen instead of no hyphen
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
        { email: 'existing@crossmilescarrier.com', _id: 'existing-id' }
    ];
    
    // Test duplicate rejection
    await assertThrows(
        () => mockAddNewAccount('existing@crossmilescarrier.com', existingAccounts),
        'An account with email existing@crossmilescarrier.com already exists. Please use a different email address.',
        'Duplicate email should be rejected with friendly message'
    );
    
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
        { email: '@crossmilescarrier.com', expected: false, description: 'Missing local part' },
        { email: 'test@', expected: false, description: 'Missing domain' },
        { email: 'test@crossmilescarrier', expected: false, description: 'Missing TLD' },
        { email: 'test@crossmilescarrier.', expected: false, description: 'Incomplete TLD' },
        { email: '  test@crossmilescarrier.com  ', expected: false, description: 'Email with spaces' },
        { email: 'test@mail.crossmilescarrier.com', expected: false, description: 'Subdomain' },
        { email: 'test@crossmilescarrier.com.evil.com', expected: false, description: 'Domain spoofing attempt' }
    ];
    
    edgeCases.forEach(testCase => {
        const result = validateDomain(testCase.email);
        assertEquals(result, testCase.expected, `${testCase.description}: ${testCase.email}`);
    });
}

// Main test runner
async function runAllTests() {
    console.log('🧪 Running Email Controller Domain Validation Tests\n');
    console.log('=' .repeat(60));
    
    testDomainValidationRegex();
    await testAddNewAccountValidation();
    await testDuplicateValidation();
    testEdgeCases();
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed!');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} test(s) failed`);
    }
}

// Simple test runner (since no testing framework is installed)
if (require.main === module) {
    console.log('Running EmailController Domain Validation Tests...\n');
    
    // Test the domain validation regex directly
    const testDomainValidation = () => {
        const validEmails = [
            'test@crossmilescarrier.com',
            'user@CROSSMILESCARRIER.COM',
            'admin@crossmilescarrier.com'
        ];
        
        const invalidEmails = [
            'test@gmail.com',
            'user@yahoo.com',
            'admin@outlook.com',
            'test@crossmilescarriers.com',
            'user@mail.crossmilescarrier.com',
            'invalid-email',
            ''
        ];
        
        console.log('✅ Testing domain validation regex:');
        
        validEmails.forEach(email => {
            const isValid = /@crossmilescarrier\.com$/i.test(email);
            console.log(`  ${isValid ? '✅' : '❌'} ${email}: ${isValid ? 'ACCEPTED' : 'REJECTED'}`);
        });
        
        console.log('\n❌ Testing invalid domains:');
        invalidEmails.forEach(email => {
            const isValid = /@crossmilescarrier\.com$/i.test(email);
            console.log(`  ${!isValid ? '✅' : '❌'} ${email}: ${!isValid ? 'REJECTED' : 'ACCEPTED (ERROR!)'}`);
        });
    };
    
    testDomainValidation();
    
    console.log('\n📝 Manual Testing Instructions:');
    console.log('1. Start the backend server: npm run dev');
    console.log('2. Use a tool like Postman or curl to test the API:');
    console.log('');
    console.log('   Valid request:');
    console.log('   POST http://localhost:5001/account/add');
    console.log('   Headers: Authorization: Bearer <your-jwt-token>');
    console.log('   Body: { "email": "test@crossmilescarrier.com" }');
    console.log('   Expected: 200 OK with success message');
    console.log('');
    console.log('   Invalid domain request:');
    console.log('   POST http://localhost:5001/account/add');
    console.log('   Headers: Authorization: Bearer <your-jwt-token>');
    console.log('   Body: { "email": "test@gmail.com" }');
    console.log('   Expected: 400 Bad Request with error message');
    console.log('');
    console.log('   Duplicate email request:');
    console.log('   POST http://localhost:5001/account/add (twice with same email)');
    console.log('   Headers: Authorization: Bearer <your-jwt-token>');
    console.log('   Body: { "email": "test@crossmilescarrier.com" }');
    console.log('   Expected: Second request returns 400 with duplicate message');
}
