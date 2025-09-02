const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testNewScopes() {
    try {
        console.log('🔍 Testing new Google Chat scopes for CMC space...');
        
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly", 
            "https://www.googleapis.com/auth/admin.directory.user.readonly",
            "https://www.googleapis.com/auth/chat.memberships.readonly", // NEW
            "https://www.googleapis.com/auth/chat.admin.memberships.readonly", // NEW
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            'naveendev@crossmilescarrier.com'
        );

        const chat = google.chat({ version: "v1", auth });
        const admin = google.admin({ version: "directory_v1", auth });
        const spaceId = 'spaces/AAQAPUbCMD0'; // CMC space
        
        console.log('\\nStep 1: Testing space access...');
        try {
            const spaceRes = await chat.spaces.get({ name: spaceId });
            console.log('✅ Space found:', spaceRes.data.displayName || spaceRes.data.name);
        } catch (error) {
            console.log('❌ Cannot access space:', error.message);
            return;
        }
        
        console.log('\\nStep 2: Testing member access with new scopes...');
        try {
            const membersRes = await chat.spaces.members.list({ parent: spaceId });
            const members = membersRes?.data?.memberships || [];
            console.log(`✅ SUCCESS! Found ${members.length} members with new scopes:`);
            
            for (let i = 0; i < members.length; i++) {
                const member = members[i];
                console.log(`\\n  Member ${i + 1}:`);
                console.log(`    User ID: ${member.member?.name}`);
                console.log(`    Role: ${member.role}`);
                console.log(`    State: ${member.state}`);
                console.log(`    Member Type: ${member.member?.type}`);
                
                // Try to resolve the name using Admin API
                if (member.member?.name && member.member.name.startsWith('users/')) {
                    const numericId = member.member.name.split('/')[1];
                    try {
                        const userRes = await admin.users.get({ userKey: numericId });
                        console.log(`    ✅ REAL NAME: ${userRes.data.name?.fullName}`);
                        console.log(`    📧 EMAIL: ${userRes.data.primaryEmail}`);
                    } catch (adminError) {
                        console.log(`    ❌ Admin API failed: ${adminError.message}`);
                    }
                }
            }
        } catch (error) {
            console.log('❌ Member access still failed:', error.message);
            if (error.message.includes('insufficient_scope')) {
                console.log('\\n🔧 The new scopes still need to be authorized in Google Cloud Console:');
                console.log('   1. Go to Google Cloud Console');
                console.log('   2. Navigate to APIs & Services > OAuth consent screen');
                console.log('   3. Add the new scopes:');
                console.log('      - https://www.googleapis.com/auth/chat.memberships.readonly');
                console.log('      - https://www.googleapis.com/auth/chat.admin.memberships.readonly');
                console.log('   4. Re-test this function');
            }
        }
        
        console.log('\\nStep 3: Testing message access (should work)...');
        try {
            const messagesRes = await chat.spaces.messages.list({
                parent: spaceId,
                pageSize: 5
            });
            const messages = messagesRes.data?.messages || [];
            console.log(`✅ Found ${messages.length} messages`);
            
            const uniqueSenders = new Set();
            messages.forEach(message => {
                if (message.sender?.name) {
                    uniqueSenders.add(message.sender.name);
                }
            });
            console.log(`   Unique senders: ${Array.from(uniqueSenders).join(', ')}`);
            
            // Resolve sender names
            for (const senderId of uniqueSenders) {
                if (senderId.startsWith('users/')) {
                    const numericId = senderId.split('/')[1];
                    try {
                        const userRes = await admin.users.get({ userKey: numericId });
                        console.log(`   ${senderId} -> ${userRes.data.name?.fullName} (${userRes.data.primaryEmail})`);
                    } catch (adminError) {
                        console.log(`   ${senderId} -> Admin resolution failed: ${adminError.message}`);
                    }
                }
            }
            
        } catch (error) {
            console.log('❌ Message access failed:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Overall error:', error);
    }
}

testNewScopes();
