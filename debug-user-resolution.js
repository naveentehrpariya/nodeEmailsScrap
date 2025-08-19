const { google } = require('googleapis');
const keys = require('./dispatch.json');

const DOMAIN = "crossmilescarrier.com";
const TEST_USER_EMAIL = "naveendev@crossmilescarrier.com";

async function testUserResolution() {
    console.log('🔍 Testing Google User Resolution...\n');
    
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly", 
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ];

    const auth = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        SCOPES,
        TEST_USER_EMAIL
    );

    try {
        // Test 1: Get current user ID
        console.log('1. Testing getCurrentUserId...');
        const admin = google.admin({ version: "directory_v1", auth });
        
        try {
            const res = await admin.users.get({ userKey: TEST_USER_EMAIL });
            const currentUserId = `users/${res.data.id}`;
            console.log(`✅ Current User ID: ${currentUserId}`);
            console.log(`✅ User Data:`, {
                email: res.data.primaryEmail,
                name: res.data.name?.fullName,
                id: res.data.id
            });
            
            // Test 2: Try to resolve this ID back to user info
            console.log('\n2. Testing resolveUserId with this ID...');
            await testResolveUserId(auth, currentUserId);
            
        } catch (error) {
            console.error('❌ Failed to get current user:', error.message);
            console.error('❌ Error details:');
            console.error('  - errors:', error.errors);
            console.error('  - code:', error.code);
            console.error('  - auth.subject (impersonated user):', auth.subject);
        }

        // Test 3: List some users to see available data
        console.log('\n3. Listing domain users...');
        try {
            const listRes = await admin.users.list({
                domain: DOMAIN,
                maxResults: 5
            });
            
            console.log(`✅ Found ${listRes.data.users?.length || 0} users:`);
            listRes.data.users?.forEach((user, index) => {
                console.log(`  ${index + 1}. ${user.primaryEmail} - ${user.name?.fullName} (ID: ${user.id})`);
                
                // Test resolving each user ID
                if (index === 0) {  // Test first user
                    console.log(`\n4. Testing resolveUserId with first user ID: users/${user.id}`);
                    testResolveUserId(auth, `users/${user.id}`);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to list users:', error.message);
            console.error('❌ Error details:');
            console.error('  - errors:', error.errors);
            console.error('  - code:', error.code);
            console.error('  - auth.subject (impersonated user):', auth.subject);
        }

        // Test 4: Test Chat API and see what sender IDs look like
        console.log('\n5. Testing Chat API to see actual sender formats...');
        try {
            const chat = google.chat({ version: "v1", auth });
            const spaceRes = await chat.spaces.list();
            const spaces = spaceRes.data.spaces || [];
            
            if (spaces.length > 0) {
                const space = spaces[0];
                console.log(`✅ Found ${spaces.length} spaces, testing first: ${space.name}`);
                
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 3
                });
                
                const messages = messageRes.data.messages || [];
                console.log(`✅ Found ${messages.length} messages in first space:`);
                
                messages.forEach((msg, index) => {
                    console.log(`  Message ${index + 1}:`);
                    console.log(`    Sender: ${msg.sender?.name}`);
                    console.log(`    Text: ${msg.text?.substring(0, 50)}...`);
                    
                    // Test resolving this actual sender ID
                    if (index === 0 && msg.sender?.name) {
                        console.log(`\n6. Testing resolveUserId with actual sender: ${msg.sender.name}`);
                        testResolveUserId(auth, msg.sender.name);
                    }
                });
            } else {
                console.log('⚠️ No spaces found');
            }
            
        } catch (error) {
            console.error('❌ Failed to test Chat API:', error.message);
        }

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    }
}

async function testResolveUserId(auth, userResourceName) {
    try {
        let userId = userResourceName;
        
        // If it's in format "users/123456789", extract the ID
        if (userResourceName.includes('/')) {
            userId = userResourceName.split('/').pop();
        }
        
        console.log(`   Trying to resolve: ${userResourceName} -> ${userId}`);
        
        // If it's already an email, return it directly
        if (userId.includes('@')) {
            console.log(`   ✅ Already an email: ${userId}`);
            return;
        }
        
        // Try to resolve via Google Admin Directory API
        const admin = google.admin({ version: "directory_v1", auth });
        
        try {
            const res = await admin.users.get({ userKey: userId });
            console.log(`   ✅ Resolved successfully:`, {
                email: res.data.primaryEmail,
                displayName: res.data.name?.fullName,
                domain: res.data.primaryEmail.split("@")[1]
            });
        } catch (adminError) {
            console.log(`   ⚠️ Admin API failed: ${adminError.message}`);
            console.log(`   ⚠️ Admin API error details:`);
            console.log(`     - errors:`, adminError.errors);
            console.log(`     - code:`, adminError.code);
            console.log(`     - auth.subject (impersonated user):`, auth.subject);
            
            // Try listing approach
            try {
                const listRes = await admin.users.list({
                    domain: DOMAIN,
                    maxResults: 500
                });
                
                const user = listRes.data.users?.find(u => u.id === userId);
                if (user) {
                    console.log(`   ✅ Found via list:`, {
                        email: user.primaryEmail,
                        displayName: user.name?.fullName,
                        domain: user.primaryEmail.split("@")[1]
                    });
                } else {
                    console.log(`   ❌ User not found in domain users list`);
                }
            } catch (listError) {
                console.log(`   ❌ List approach also failed: ${listError.message}`);
                console.log(`   ❌ List error details:`);
                console.log(`     - errors:`, listError.errors);
                console.log(`     - code:`, listError.code);
                console.log(`     - auth.subject (impersonated user):`, auth.subject);
            }
        }
        
    } catch (error) {
        console.error(`   ❌ testResolveUserId failed:`, error.message);
    }
}

// Run the test
testUserResolution().catch(console.error);
