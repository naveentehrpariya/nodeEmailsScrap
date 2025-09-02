const axios = require('axios');

async function testUserResolution() {
    const API_BASE = 'http://localhost:5000'; // Adjust port as needed
    
    try {
        console.log('🧪 Testing user resolution API endpoint...');
        
        // Test resolution endpoint
        const response = await axios.post(`${API_BASE}/api/user-mappings/resolve`, {
            userIds: ['users/108506371856200018714', 'users/115048080534626721571'], // Test with specific IDs
            force: true
        });
        
        console.log('✅ API Response:', JSON.stringify(response.data, null, 2));
        
        // Test getting user mappings
        const mappingsResponse = await axios.get(`${API_BASE}/api/user-mappings?limit=5`);
        console.log('\n📋 Current User Mappings:', JSON.stringify(mappingsResponse.data, null, 2));
        
        // Test getting stats
        const statsResponse = await axios.get(`${API_BASE}/api/user-mappings/stats/overview`);
        console.log('\n📊 User Mapping Stats:', JSON.stringify(statsResponse.data, null, 2));
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Only run if called directly
if (require.main === module) {
    testUserResolution();
}

module.exports = { testUserResolution };
