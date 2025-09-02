const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testDirectChatAPI() {
    console.log('🔍 Testing Direct Google Chat API Access...\n');
    
    // Test with naveendev account
    const testUserEmail = 'naveendev@crossmilescarrier.com';
    
    // Use working scopes
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ];
    
    try {
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            testUserEmail
        );
        
        const chat = google.chat({ version: 'v1', auth });
        const admin = google.admin({ version: 'directory_v1', auth });
        
        console.log('🚀 Getting current user ID...');
        let currentUserId = null;
        try {
            const userRes = await admin.users.get({ userKey: testUserEmail });
            currentUserId = `users/${userRes.data.id}`;
            console.log(`✅ Current user ID: ${currentUserId}`);
            console.log(`   Name: ${userRes.data.name?.fullName || 'Unknown'}`);
        } catch (e) {
            console.log(`❌ Failed to get current user ID: ${e.message}`);
        }
        
        console.log('\\n📝 Fetching all spaces...');
        const spacesRes = await chat.spaces.list();
        const spaces = spacesRes.data.spaces || [];
        
        console.log(`Found ${spaces.length} total spaces:`);
        
        for (let i = 0; i < Math.min(spaces.length, 10); i++) {
            const space = spaces[i];
            const spaceId = space.name;
            const spaceType = space.spaceType;
            const displayName = space.displayName || '(No name)';
            
            console.log(`\\n${i + 1}. ${displayName} (${spaceType})`);
            console.log(`   Space ID: ${spaceId}`);
            
            // Get messages for this space
            try {
                const messagesRes = await chat.spaces.messages.list({
                    parent: spaceId,
                    pageSize: 5
                });
                
                const messages = messagesRes.data.messages || [];
                console.log(`   Messages: ${messages.length}`);
                
                // Show message senders
                const senders = new Set();
                for (const msg of messages) {
                    if (msg.sender?.name) {
                        senders.add(msg.sender.name);
                    }
                }
                
                if (senders.size > 0) {
                    console.log(`   Senders: ${Array.from(senders).join(', ')}`);
                    
                    // Try to resolve sender names via Admin API
                    for (const senderId of Array.from(senders).slice(0, 2)) {
                        try {
                            const numericId = senderId.split('/').pop();
                            const senderRes = await admin.users.get({ userKey: numericId });
                            const senderName = senderRes.data.name?.fullName || 'Unknown';
                            const senderEmail = senderRes.data.primaryEmail || 'Unknown';
                            console.log(`     ${senderId} -> ${senderName} (${senderEmail})`);
                        } catch (adminError) {
                            console.log(`     ${senderId} -> [Admin API failed: ${adminError.message.split('.')[0]}]`);
                        }
                    }
                }
                
            } catch (msgError) {
                console.log(`   Error getting messages: ${msgError.message}`);
            }
            
            if (i >= 4) {
                console.log(`\\n... (showing first 5 of ${spaces.length} spaces)`);
                break;
            }
        }
        
    } catch (error) {
        console.log('❌ API test failed:', error.message);
    }
}

testDirectChatAPI().catch(console.error);
