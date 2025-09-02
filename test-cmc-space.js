const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testCMCSpace() {
    try {
        console.log('🔍 Testing CMC space access with detailed debugging...');
        
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
            'naveendev@crossmilescarrier.com'
        );

        const chat = google.chat({ version: "v1", auth });
        const admin = google.admin({ version: "directory_v1", auth });
        const spaceId = 'spaces/AAQAPUbCMD0'; // CMC space
        
        // 1. Get space info
        console.log('\\n📋 Step 1: Getting space info...');
        try {
            const spaceRes = await chat.spaces.get({ name: spaceId });
            console.log('✅ Space details:', JSON.stringify(spaceRes.data, null, 2));
        } catch (error) {
            console.log('❌ Failed to get space info:', error.message);
            return;
        }
        
        // 2. Try to get members with different approaches
        console.log('\\n👥 Step 2: Testing members access...');
        try {
            console.log('Trying spaces.members.list...');
            const membersRes = await chat.spaces.members.list({ parent: spaceId });
            console.log('✅ Raw members response:', JSON.stringify(membersRes.data, null, 2));
            
            const members = membersRes.data?.memberships || [];
            console.log(`Found ${members.length} memberships:`);
            
            for (let i = 0; i < members.length; i++) {
                const member = members[i];
                console.log(`\\n  Member ${i + 1}:`);
                console.log('    Raw member data:', JSON.stringify(member, null, 2));
                
                if (member.member && member.member.name) {
                    const userId = member.member.name;
                    console.log(`    User ID: ${userId}`);
                    
                    // Try to resolve using Admin API
                    if (userId.startsWith('users/')) {
                        const numericId = userId.split('/')[1];
                        try {
                            console.log(`    Trying Admin API with: ${numericId}`);
                            const userRes = await admin.users.get({ userKey: numericId });
                            console.log(`    ✅ Admin API result:`, {
                                email: userRes.data.primaryEmail,
                                displayName: userRes.data.name?.fullName,
                                firstName: userRes.data.name?.givenName,
                                lastName: userRes.data.name?.familyName
                            });
                        } catch (adminError) {
                            console.log(`    ❌ Admin API failed: ${adminError.message}`);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.log('❌ Failed to get members:', error.message);
            console.log('Error details:', error);
        }
        
        // 3. Get recent messages to see other participants
        console.log('\\n💬 Step 3: Getting recent messages...');
        try {
            const messagesRes = await chat.spaces.messages.list({
                parent: spaceId,
                pageSize: 10
            });
            
            const messages = messagesRes.data?.messages || [];
            console.log(`✅ Found ${messages.length} messages`);
            
            const uniqueSenders = new Set();
            messages.forEach((message, index) => {
                console.log(`\\n  Message ${index + 1}:`);
                console.log('    Sender:', message.sender);
                console.log('    Text preview:', (message.text || '').substring(0, 50));
                console.log('    Create time:', message.createTime);
                
                if (message.sender?.name) {
                    uniqueSenders.add(message.sender.name);
                }
            });
            
            console.log('\\n  Unique senders found:', Array.from(uniqueSenders));
            
        } catch (error) {
            console.log('❌ Failed to get messages:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Overall error:', error);
    }
}

testCMCSpace();
