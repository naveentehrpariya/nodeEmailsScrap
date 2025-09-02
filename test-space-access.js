const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testSpaceAccess() {
    try {
        console.log('🔍 Testing Google Chat API access for space: spaces/lVOdZCAAAAE');
        
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
        const spaceId = 'spaces/lVOdZCAAAAE';
        
        // 1. Test space access
        console.log('\\n📋 Step 1: Testing space info access...');
        try {
            const spaceRes = await chat.spaces.get({ name: spaceId });
            console.log('✅ Space info retrieved:', spaceRes.data);
        } catch (error) {
            console.log('❌ Failed to get space info:', error.message);
        }
        
        // 2. Test members access
        console.log('\\n👥 Step 2: Testing members access...');
        try {
            const membersRes = await chat.spaces.members.list({ parent: spaceId });
            console.log('✅ Members found:', membersRes.data?.memberships?.length || 0);
            console.log('Members:', JSON.stringify(membersRes.data, null, 2));
        } catch (error) {
            console.log('❌ Failed to get members:', error.message);
        }
        
        // 3. Test messages access
        console.log('\\n💬 Step 3: Testing messages access...');
        try {
            const messagesRes = await chat.spaces.messages.list({
                parent: spaceId,
                pageSize: 10
            });
            console.log('✅ Messages found:', messagesRes.data?.messages?.length || 0);
            if (messagesRes.data?.messages?.length > 0) {
                console.log('First message:', JSON.stringify(messagesRes.data.messages[0], null, 2));
            }
        } catch (error) {
            console.log('❌ Failed to get messages:', error.message);
        }
        
        // 4. Test list all spaces to see what's accessible
        console.log('\\n📄 Step 4: Testing spaces list to see what spaces are accessible...');
        try {
            const spacesRes = await chat.spaces.list();
            const spaces = spacesRes.data.spaces || [];
            console.log(`✅ Found ${spaces.length} accessible spaces:`);
            spaces.forEach((space, index) => {
                console.log(`  ${index + 1}. ${space.name} - ${space.displayName || '(no name)'} - ${space.spaceType}`);
            });
        } catch (error) {
            console.log('❌ Failed to list spaces:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Overall error:', error);
    }
}

testSpaceAccess();
