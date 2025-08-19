const { google } = require('googleapis');
const keys = require('./dispatch.json');

const DOMAIN = "crossmilescarrier.com";
const TEST_USER_EMAIL = "naveendev@crossmilescarrier.com";

async function testImprovedUserResolution() {
    console.log('🔍 Testing Improved User Resolution...\n');
    
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
        console.log('1. Getting chat spaces and messages...');
        const chat = google.chat({ version: "v1", auth });
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        if (spaces.length > 0) {
            const space = spaces[0];
            const spaceId = space.name;
            console.log(`✅ Testing with space: ${spaceId}`);
            
            // Get messages from this space
            const messageRes = await chat.spaces.messages.list({
                parent: spaceId,
                pageSize: 3
            });
            
            const messages = messageRes.data.messages || [];
            console.log(`✅ Found ${messages.length} messages`);
            
            // Test the improved resolveUserId function for each sender
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const senderId = msg.sender?.name;
                
                if (senderId) {
                    console.log(`\n${i + 1}. Testing sender: ${senderId}`);
                    const result = await testResolveUserId(auth, senderId, spaceId);
                    console.log(`   Result: ${result.displayName} (${result.email})`);
                }
            }
            
            // Test chat members API directly
            console.log(`\n2. Testing space members for ${spaceId}...`);
            try {
                const membersRes = await chat.spaces.members.list({
                    parent: spaceId
                });
                
                const memberships = membersRes.data.memberships || [];
                console.log(`✅ Found ${memberships.length} members:`);
                
                memberships.forEach((membership, index) => {
                    const member = membership.member;
                    if (member) {
                        console.log(`  ${index + 1}. ${member.name} - ${member.displayName || 'No display name'}`);
                    }
                });
                
            } catch (membersError) {
                console.log(`⚠️ Members API failed: ${membersError.message}`);
            }
            
        } else {
            console.log('⚠️ No spaces found');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

async function testResolveUserId(auth, userResourceName, spaceId = null) {
    try {
        // Handle different formats of userResourceName
        let userId = userResourceName;
        
        // If it's in format "users/123456789", extract the ID
        if (userResourceName.includes('/')) {
            userId = userResourceName.split('/').pop();
        }
        
        // If it's already an email, return it directly
        if (userId.includes('@')) {
            return {
                email: userId,
                displayName: userId.split('@')[0], // Use email prefix as fallback name
                domain: userId.split('@')[1]
            };
        }
        
        // First, try to resolve via Chat API space members if spaceId is provided
        if (spaceId) {
            try {
                const chat = google.chat({ version: "v1", auth });
                const membersRes = await chat.spaces.members.list({
                    parent: spaceId
                });
                
                const member = membersRes.data.memberships?.find(m => 
                    m.member?.name === userResourceName
                );
                
                if (member?.member?.displayName) {
                    console.log(`   ✅ Found via Chat Members API: ${member.member.displayName}`);
                    
                    // Extract email from the user resource name pattern if available
                    let email = `user-${userId}@${DOMAIN}`;
                    if (member.member.name && member.member.name.includes('users/')) {
                        // Try to match common patterns or use the display name as a hint
                        const displayName = member.member.displayName;
                        if (displayName.includes('@')) {
                            email = displayName;
                        } else {
                            // Create a reasonable email from display name
                            const cleanName = displayName.toLowerCase().replace(/\\s+/g, '.');
                            email = `${cleanName}@${DOMAIN}`;
                        }
                    }
                    
                    return {
                        email: email,
                        displayName: member.member.displayName,
                        domain: email.split('@')[1]
                    };
                }
            } catch (chatMembersError) {
                console.log(`   ⚠️ Chat members API failed: ${chatMembersError.message}`);
            }
        }
        
        // Try to resolve via Google Admin Directory API (though this may fail due to permissions)
        try {
            const admin = google.admin({ version: "directory_v1", auth });
            const res = await admin.users.get({ userKey: userId });
            console.log(`   ✅ Found via Admin Directory API: ${res.data.name?.fullName}`);
            return {
                email: res.data.primaryEmail,
                displayName: res.data.name?.fullName || res.data.primaryEmail.split('@')[0],
                domain: res.data.primaryEmail.split("@")[1]
            };
        } catch (adminError) {
            // Admin API failed, this is expected due to permissions
            console.log(`   ⚠️ Admin Directory API failed (expected): ${adminError.message}`);
        }
        
        // Enhanced fallback: Create a more user-friendly display
        const shortId = userId.substring(0, 8);
        console.log(`   📋 Using fallback display: User ${shortId}`);
        return {
            email: `user-${userId}@${DOMAIN}`,
            displayName: `User ${shortId}`, // Cleaner fallback name
            domain: DOMAIN
        };
        
    } catch (e) {
        console.error(`   ❌ testResolveUserId failed:`, e.message);
        
        // Final fallback for completely unknown users
        const fallbackName = userResourceName.includes('/') ? 
            `User ${userResourceName.split('/').pop().substring(0, 8)}` : 
            userResourceName;
            
        return {
            email: userResourceName.includes('@') ? userResourceName : `${userResourceName}@unknown`,
            displayName: fallbackName,
            domain: "unknown"
        };
    }
}

// Run the test
testImprovedUserResolution().catch(console.error);
