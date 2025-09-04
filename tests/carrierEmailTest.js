/**
 * Test Script for Carrier Multiple Email Functionality
 * 
 * This script tests the carrier management system with multiple email support
 * without requiring authentication (uses test endpoints)
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.APP_URL ||'http://localhost:8080'; // Adjust according to your server
const TEST_API_PREFIX = '/api/test';

// Test data
const testCarrierData = {
    name: 'Test Carrier Company',
    mc_code: 'MC123456',
    phone: '+1-555-0123',
    location: '123 Main St',
    city: 'Test City',
    state: 'CA',
    zipcode: '90210',
    country: 'USA',
    // Multiple emails in new format
    emails: [
        {
            email: 'primary@testcarrier.com',
            is_primary: true
        },
        {
            email: 'secondary@testcarrier.com',
            is_primary: false
        },
        {
            email: 'dispatch@testcarrier.com',
            is_primary: false
        }
    ]
};

const testCarrierDataLegacy = {
    name: 'Legacy Test Carrier',
    mc_code: 'MC789012',
    phone: '+1-555-0456',
    // Legacy email format
    email: 'legacy@testcarrier.com',
    secondary_email: 'legacy2@testcarrier.com',
    location: '456 Legacy Ave',
    city: 'Legacy City',
    state: 'TX',
    zipcode: '75001',
    country: 'USA'
};

// API helper functions
const api = {
    async post(endpoint, data) {
        try {
            const response = await axios.post(`${BASE_URL}${TEST_API_PREFIX}${endpoint}`, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data || error.message,
                status: error.response?.status
            };
        }
    },

    async get(endpoint) {
        try {
            const response = await axios.get(`${BASE_URL}${TEST_API_PREFIX}${endpoint}`);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data || error.message,
                status: error.response?.status
            };
        }
    },

    async put(endpoint, data) {
        try {
            const response = await axios.put(`${BASE_URL}${TEST_API_PREFIX}${endpoint}`, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data || error.message,
                status: error.response?.status
            };
        }
    },

    async delete(endpoint) {
        try {
            const response = await axios.delete(`${BASE_URL}${TEST_API_PREFIX}${endpoint}`);
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data || error.message,
                status: error.response?.status
            };
        }
    }
};

// Test functions
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
};

function logTest(testName, passed, message = '') {
    testResults.total++;
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${testName}: PASSED ${message}`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: FAILED ${message}`);
    }
    testResults.details.push({ testName, passed, message });
}

async function testCarrierCreation() {
    console.log('\n📝 Testing Carrier Creation...');
    
    // Test 1: Create carrier with new email format
    const result1 = await api.post('/carriers', testCarrierData);
    logTest(
        'Create carrier with multiple emails', 
        result1.success && result1.data.status === true,
        result1.success ? `Created with ID: ${result1.data.carrier?._id}` : result1.error
    );
    
    if (result1.success && result1.data.carrier) {
        testCarrierData._id = result1.data.carrier._id;
    }

    // Test 2: Create carrier with legacy email format
    const result2 = await api.post('/carriers', testCarrierDataLegacy);
    logTest(
        'Create carrier with legacy emails', 
        result2.success && result2.data.status === true,
        result2.success ? `Created with ID: ${result2.data.carrier?._id}` : result2.error
    );
    
    if (result2.success && result2.data.carrier) {
        testCarrierDataLegacy._id = result2.data.carrier._id;
    }

    // Test 3: Try to create duplicate MC Code
    const result3 = await api.post('/carriers', { ...testCarrierData, name: 'Duplicate MC Test' });
    logTest(
        'Prevent duplicate MC Code', 
        !result3.success || result3.data.status === false,
        'Should fail with duplicate MC Code error'
    );
}

async function testCarrierRetrieval() {
    console.log('\n📖 Testing Carrier Retrieval...');
    
    // Test 1: Get all carriers
    const result1 = await api.get('/carriers');
    logTest(
        'Get all carriers', 
        result1.success && result1.data.status === true && Array.isArray(result1.data.carriers),
        result1.success ? `Found ${result1.data.carriers?.length} carriers` : result1.error
    );
    
    // Test 2: Get specific carrier
    if (testCarrierData._id) {
        const result2 = await api.get(`/carriers/${testCarrierData._id}`);
        logTest(
            'Get specific carrier', 
            result2.success && result2.data.status === true && result2.data.carrier,
            result2.success ? `Retrieved carrier: ${result2.data.carrier?.name}` : result2.error
        );
    }

    // Test 3: Search by MC Code
    const result3 = await api.get('/carriers?search=MC123456');
    logTest(
        'Search by MC Code', 
        result3.success && result3.data.carriers?.length > 0,
        result3.success ? `Found ${result3.data.carriers?.length} results` : result3.error
    );

    // Test 4: Search by name
    const result4 = await api.get('/carriers?search=Test Carrier');
    logTest(
        'Search by name', 
        result4.success && result4.data.carriers?.length > 0,
        result4.success ? `Found ${result4.data.carriers?.length} results` : result4.error
    );
}

async function testEmailFunctionality() {
    console.log('\n📧 Testing Email Functionality...');
    
    // Test 1: Get carrier emails
    if (testCarrierData._id) {
        const result1 = await api.get(`/carriers/${testCarrierData._id}/emails`);
        logTest(
            'Get carrier emails', 
            result1.success && result1.data.status === true && result1.data.data,
            result1.success ? `Found ${result1.data.data?.totalEmails} emails` : result1.error
        );
    }

    // Test 2: Find carrier by email
    const result2 = await api.get('/carriers/search/email/primary@testcarrier.com');
    logTest(
        'Find carrier by email', 
        result2.success && result2.data.status === true,
        result2.success ? `Found carrier: ${result2.data.carrier?.name}` : result2.error
    );

    // Test 3: Find carrier by legacy email
    const result3 = await api.get('/carriers/search/email/legacy@testcarrier.com');
    logTest(
        'Find carrier by legacy email', 
        result3.success && result3.data.status === true,
        result3.success ? `Found carrier: ${result3.data.carrier?.name}` : result3.error
    );
}

async function testCarrierUpdate() {
    console.log('\n✏️ Testing Carrier Updates...');
    
    if (!testCarrierData._id) {
        logTest('Update carrier', false, 'No carrier ID available for update test');
        return;
    }

    // Test 1: Update carrier with new email
    const updateData = {
        name: 'Updated Test Carrier',
        emails: [
            { email: 'primary@testcarrier.com', is_primary: true },
            { email: 'secondary@testcarrier.com', is_primary: false },
            { email: 'new@testcarrier.com', is_primary: false }
        ]
    };
    
    const result1 = await api.put(`/carriers/${testCarrierData._id}`, updateData);
    logTest(
        'Update carrier with new email', 
        result1.success && result1.data.status === true,
        result1.success ? 'Carrier updated successfully' : result1.error
    );

    // Test 2: Update with duplicate MC Code (should fail)
    const result2 = await api.put(`/carriers/${testCarrierData._id}`, { mc_code: 'MC789012' });
    logTest(
        'Prevent duplicate MC Code on update', 
        !result2.success || result2.data.status === false,
        'Should fail with duplicate MC Code error'
    );
}

async function testCarrierDeletion() {
    console.log('\n🗑️ Testing Carrier Deletion...');
    
    // Test 1: Delete carrier (soft delete)
    if (testCarrierData._id) {
        const result1 = await api.delete(`/carriers/${testCarrierData._id}`);
        logTest(
            'Delete carrier', 
            result1.success && result1.data.status === true,
            result1.success ? 'Carrier deleted successfully' : result1.error
        );
    }

    // Test 2: Delete legacy carrier
    if (testCarrierDataLegacy._id) {
        const result2 = await api.delete(`/carriers/${testCarrierDataLegacy._id}`);
        logTest(
            'Delete legacy carrier', 
            result2.success && result2.data.status === true,
            result2.success ? 'Legacy carrier deleted successfully' : result2.error
        );
    }

    // Test 3: Try to get deleted carrier (should fail)
    if (testCarrierData._id) {
        const result3 = await api.get(`/carriers/${testCarrierData._id}`);
        logTest(
            'Get deleted carrier should fail', 
            !result3.success || result3.data.status === false,
            'Should not find deleted carrier'
        );
    }
}

function printTestSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('🧪 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📊 Total: ${testResults.total}`);
    console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.details
            .filter(test => !test.passed)
            .forEach(test => console.log(`   - ${test.testName}: ${test.message}`));
    }
    
    console.log('='.repeat(50));
}

// Main test execution
async function runAllTests() {
    console.log('🚀 Starting Carrier Multiple Email Tests...');
    console.log(`📍 Testing against: ${BASE_URL}`);
    
    try {
        await testCarrierCreation();
        await testCarrierRetrieval();
        await testEmailFunctionality();
        await testCarrierUpdate();
        await testCarrierDeletion();
        
        printTestSummary();
        
        if (testResults.failed === 0) {
            console.log('🎉 All tests passed! The carrier multiple email system is working correctly.');
            process.exit(0);
        } else {
            console.log('⚠️ Some tests failed. Please review the implementation.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    }
}

// Export for manual testing
module.exports = {
    runAllTests,
    testCarrierCreation,
    testCarrierRetrieval,
    testEmailFunctionality,
    testCarrierUpdate,
    testCarrierDeletion,
    api
};

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests();
}
