const { google } = require('googleapis');
const keys = require('./dispatch.json');

const DOMAIN = "crossmilescarrier.com";
const TEST_USER_EMAIL = "naveendev@crossmilescarrier.com";

// Import the improved resolveUserId function (same as in our services)
async function resolveUserId(auth, userResourceName, spaceId = null) {
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
                // console.log(`Chat members API failed for ${userId}:`, chatMembersError.message);
            }
        }
        
        // Try to resolve via Google Admin Directory API (though this may fail due to permissions)
        try {
            const admin = google.admin({ version: "directory_v1", auth });
            const res = await admin.users.get({ userKey: userId });
            return {
                email: res.data.primaryEmail,
                displayName: res.data.name?.fullName || res.data.primaryEmail.split('@')[0],
                domain: res.data.primaryEmail.split("@")[1]
            };
        } catch (adminError) {
            // Admin API failed, this is expected due to permissions
            // console.log(`Admin API failed for ${userId}:`, adminError.message);
        }
        
        // Enhanced fallback: Create a more user-friendly display
        const shortId = userId.substring(0, 8);
        return {
            email: `user-${userId}@${DOMAIN}`,
            displayName: `User ${shortId}`, // Cleaner fallback name
            domain: DOMAIN
        };
        
    } catch (e) {
        console.error(`Failed to resolve user ${userResourceName}: ${e.message}`);
        
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

async function demonstrateImprovement() {
    console.log('🎯 Demonstrating User ID Resolution Improvements\n');
    
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

    // Test real user IDs found in your chat
    const testUserIds = [
        "users/108506371856200018714",
        "users/104329836262309309664",
        "naveendev@crossmilescarrier.com"
    ];
    
    console.log('OLD vs NEW User ID Resolution:\n');
    
    for (const userId of testUserIds) {
        console.log(`Input: ${userId}`);
        
        // Show old behavior (what user would see before)
        console.log(`  ❌ OLD: ${userId}`);
        
        // Show new behavior (what user will see now)
        const resolved = await resolveUserId(auth, userId);
        console.log(`  ✅ NEW: ${resolved.displayName}`);
        console.log(`       Email: ${resolved.email}`);
        console.log(`       Domain: ${resolved.domain}\n`);
    }
    
    console.log('📊 Summary of Improvements:');
    console.log('  • User IDs like "users/108506371856200018714" now show as "User 10850637"');
    console.log('  • Email addresses are properly detected and displayed');
    console.log('  • Fallback system provides user-friendly names instead of raw IDs');
    console.log('  • Chat members API integration (when permissions allow)');
    console.log('  • Admin Directory API fallback (when permissions allow)');
    console.log('  • Consistent email format generation for better UX');
}

// Run the demonstration
demonstrateImprovement().catch(console.error);
