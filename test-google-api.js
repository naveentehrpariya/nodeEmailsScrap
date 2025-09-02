const { google } = require('googleapis');
const keys = require('./dispatch.json');

const SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.messages.readonly"
];

async function testGoogleDirectoryAPI() {
    console.log('🔍 Testing Google Directory API Access...\n');
    
    // Test different accounts for impersonation
    const testAccounts = [
        'naveendev@crossmilescarrier.com',
        'dispatch@crossmilescarrier.com',
        'admin@crossmilescarrier.com'
    ];
    
    const testUserIds = [
        'users/108506371856200018714',
        '108506371856200018714',
        'naveendev@crossmilescarrier.com', // Try with known email
        'dispatch@crossmilescarrier.com'
    ];
    
    for (const account of testAccounts) {
        console.log(`\n📧 Testing with impersonated account: ${account}`);
        
        try {
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                SCOPES,
                account // Subject (impersonated user)
            );
            
            const admin = google.admin({ version: 'directory_v1', auth });
            
            console.log('  ✅ Auth object created successfully');
            
            // Test 1: Try to list users (basic permission test)
            try {
                console.log('  🔍 Testing users.list...');
                const listResponse = await admin.users.list({
                    domain: 'crossmilescarrier.com',
                    maxResults: 5
                });
                console.log(`  ✅ users.list success: Found ${listResponse.data.users?.length || 0} users`);
                
                if (listResponse.data.users && listResponse.data.users.length > 0) {
                    const sampleUser = listResponse.data.users[0];
                    console.log(`  📋 Sample user: ${sampleUser.primaryEmail} -> ${sampleUser.name?.fullName}`);
                }
            } catch (listError) {
                console.log(`  ❌ users.list failed: ${listError.message}`);
            }
            
            // Test 2: Try to get specific users
            for (const userId of testUserIds) {
                try {
                    console.log(`  🔍 Testing users.get for: ${userId}`);
                    const userResponse = await admin.users.get({ userKey: userId });
                    
                    if (userResponse.data) {
                        const userData = userResponse.data;
                        console.log(`  ✅ Found user: ${userData.primaryEmail} -> ${userData.name?.fullName}`);
                        console.log(`      ID: ${userData.id}, Org: ${userData.orgUnitPath}`);
                    }
                } catch (getUserError) {
                    console.log(`  ❌ users.get(${userId}) failed: ${getUserError.message}`);
                }
            }
            
        } catch (authError) {
            console.log(`  ❌ Auth failed for ${account}: ${authError.message}`);
        }
    }
    
    // Test 3: Check service account info
    console.log('\n🔑 Service Account Info:');
    console.log(`  Client Email: ${keys.client_email}`);
    console.log(`  Project ID: ${keys.project_id}`);
    console.log(`  Private Key ID: ${keys.private_key_id}`);
    
    // Test 4: Check what we can access without impersonation
    console.log('\n🚀 Testing without domain-wide delegation (no impersonation)...');
    try {
        const directAuth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES
            // No subject - direct service account access
        );
        
        const directAdmin = google.admin({ version: 'directory_v1', auth: directAuth });
        
        try {
            const response = await directAdmin.users.list({ domain: 'crossmilescarrier.com' });
            console.log('  ✅ Direct access works!');
        } catch (directError) {
            console.log(`  ❌ Direct access failed: ${directError.message}`);
            
            if (directError.message.includes('domain-wide delegation')) {
                console.log('  💡 This is expected - you need domain-wide delegation setup');
            }
        }
    } catch (error) {
        console.log(`  ❌ Direct auth setup failed: ${error.message}`);
    }
    
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Check Google Admin Console -> Security -> API Controls -> Domain-wide delegation');
    console.log('2. Ensure your service account is authorized with these scopes:');
    SCOPES.forEach(scope => console.log(`   - ${scope}`));
    console.log('3. Check if the user IDs are external (not in your domain)');
    console.log('4. Verify your service account has Super Admin or User Management Admin role');
}

// Run the test
if (require.main === module) {
    testGoogleDirectoryAPI().catch(console.error);
}

module.exports = { testGoogleDirectoryAPI };
