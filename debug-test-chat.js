const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { GoogleAuth } = require('google-auth-library');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/emailscrap';

async function debugTestChat() {
    console.log('🔍 DEBUG: Analyzing test chat for recipient identification');
    console.log('===============================================================');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        const TEST_SPACE_ID = 'spaces/2pUolCAAAAE';
        
        // 1. Get the test chat details
        console.log('\n📊 STEP 1: Test Chat Analysis');
        const testChat = await Chat.findOne({ spaceId: TEST_SPACE_ID });
        if (!testChat) {
            console.log('❌ Test chat not found!');
            return;
        }
        
        console.log(`   Chat ID: ${testChat.spaceId}`);
        console.log(`   Name: ${testChat.displayName}`);
        console.log(`   Type: ${testChat.spaceType}`);
        console.log(`   Account: ${testChat.account}`);
        console.log(`   Participants: ${testChat.participants.length}`);
        
        testChat.participants.forEach((p, i) => {
            console.log(`     ${i + 1}. ${p.displayName} (${p.email}) - ${p.userId}`);
        });
        
        // 2. Get messages from this chat
        console.log('\n📨 STEP 2: Messages Analysis');
        const messages = testChat.messages || [];
        console.log(`   Total messages: ${messages.length}`);
        
        messages.forEach((msg, i) => {
            console.log(`     ${i + 1}. "${msg.text?.substring(0, 50)}..." by ${msg.senderEmail} at ${msg.createTime}`);
            console.log(`        Sender Name: ${msg.senderDisplayName || 'Unknown'}`);
            console.log(`        Sender ID: ${msg.senderId || 'Unknown'}`);
        });
        
        // 3. Try to identify recipient from Google API
        console.log('\n🔍 STEP 3: Google API Analysis');
        
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }
        
        // Setup Google Auth
        const credentials = JSON.parse(account.credentials);
        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/chat.spaces.readonly',
                'https://www.googleapis.com/auth/chat.memberships.readonly'
            ]
        });
        
        const authClient = await auth.getClient();
        
        try {
            // Try to get space details
            console.log('   📡 Fetching space details from Google Chat API...');
            const spaceResponse = await authClient.request({
                url: `https://chat.googleapis.com/v1/${TEST_SPACE_ID}`,
                method: 'GET'
            });
            
            console.log('   ✅ Space details retrieved:');
            console.log(`      Name: ${spaceResponse.data.name || 'Unknown'}`);
            console.log(`      Display Name: ${spaceResponse.data.displayName || 'Unknown'}`);
            console.log(`      Type: ${spaceResponse.data.type || 'Unknown'}`);
            console.log(`      Space Type: ${spaceResponse.data.spaceType || 'Unknown'}`);
            
            // Try to get space members
            console.log('   📡 Fetching space members...');
            const membersResponse = await authClient.request({
                url: `https://chat.googleapis.com/v1/${TEST_SPACE_ID}/members`,
                method: 'GET'
            });
            
            console.log('   ✅ Space members retrieved:');
            if (membersResponse.data.memberships) {
                membersResponse.data.memberships.forEach((member, i) => {
                    console.log(`      ${i + 1}. ${member.member?.displayName || 'Unknown'} (${member.member?.name || 'Unknown'})`);
                    console.log(`         Type: ${member.member?.type || 'Unknown'}`);
                    if (member.member?.domainId) {
                        console.log(`         Domain: ${member.member.domainId}`);
                    }
                });
            } else {
                console.log('      No members found in response');
            }
            
        } catch (apiError) {
            console.log(`   ❌ Google API Error: ${apiError.message}`);
            if (apiError.response?.data) {
                console.log(`      Response: ${JSON.stringify(apiError.response.data, null, 2)}`);
            }
        }
        
        // 4. Check for other accounts with this space
        console.log('\n🔍 STEP 4: Cross-Account Analysis');
        const currentAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        const otherChats = await Chat.find({ 
            spaceId: TEST_SPACE_ID,
            account: { $ne: currentAccount._id }
        }).populate('account');
        
        console.log(`   Found ${otherChats.length} chats with same space ID in other accounts`);
        otherChats.forEach((chat, i) => {
            console.log(`     ${i + 1}. Account: ${chat.account?.email || 'Unknown'}`);
            console.log(`        Name: ${chat.displayName}`);
            console.log(`        Participants: ${chat.participants.length}`);
            chat.participants.forEach((p, j) => {
                console.log(`          ${j + 1}. ${p.displayName} (${p.email})`);
            });
        });
        
        // 5. Check UserMappings for potential recipients
        console.log('\n👥 STEP 5: User Mapping Analysis');
        const userMappings = await UserMapping.find({});
        console.log(`   Total user mappings: ${userMappings.length}`);
        
        // Look for users who might be the recipient
        const potentialRecipients = userMappings.filter(mapping => 
            mapping.email && 
            mapping.email !== 'naveendev@crossmilescarrier.com' &&
            mapping.email.includes('@crossmilescarrier.com')
        );
        
        console.log(`   Potential recipients from same domain: ${potentialRecipients.length}`);
        potentialRecipients.forEach((user, i) => {
            console.log(`     ${i + 1}. ${user.name} (${user.email})`);
            console.log(`        ID: ${user.userId}`);
        });
        
        // 6. Attempt to fix recipient identification
        console.log('\n🔧 STEP 6: Recipient Identification Strategy');
        
        let identifiedRecipient = null;
        
        // Strategy 1: Check if we can find the recipient in existing user mappings
        if (messages.length > 0) {
            const senderEmails = [...new Set(messages.map(m => m.senderEmail))];
            const nonCurrentUserSenders = senderEmails.filter(email => email !== 'naveendev@crossmilescarrier.com');
            
            console.log(`   Current user sends messages: ${senderEmails.includes('naveendev@crossmilescarrier.com')}`);
            console.log(`   Other senders: ${nonCurrentUserSenders.length > 0 ? nonCurrentUserSenders.join(', ') : 'None'}`);
            
            if (nonCurrentUserSenders.length > 0) {
                // Look for this sender in user mappings
                const senderMapping = userMappings.find(mapping => 
                    nonCurrentUserSenders.includes(mapping.email)
                );
                
                if (senderMapping) {
                    identifiedRecipient = {
                        name: senderMapping.name,
                        email: senderMapping.email,
                        userId: senderMapping.userId,
                        type: 'HUMAN'
                    };
                    console.log(`   ✅ Found recipient from message sender: ${senderMapping.name} (${senderMapping.email})`);
                } else {
                    console.log(`   ⚠️  Sender ${nonCurrentUserSenders[0]} not found in user mappings`);
                }
            }
        }
        
        // Strategy 2: If this is a DM and we know it's with someone else, make an educated guess
        if (!identifiedRecipient && testChat.spaceType === 'DIRECT_MESSAGE') {
            console.log('   🤔 This is a DM but recipient not identified from messages');
            console.log('   💡 Since this is a test message, the recipient is likely the person you sent the test to');
            
            // For now, let's keep the placeholder but improve it
            identifiedRecipient = {
                name: 'Unknown Recipient',
                email: 'unknown.recipient@crossmilescarrier.com',
                userId: null,
                type: 'HUMAN'
            };
        }
        
        // 7. Update the chat with better recipient info if identified
        if (identifiedRecipient) {
            console.log('\n💾 STEP 7: Updating Chat Participants');
            
            // Check if we already have a better participant than the current one
            const currentParticipant = testChat.participants[0];
            const shouldUpdate = currentParticipant && (
                currentParticipant.displayName === 'Test Recipient' ||
                currentParticipant.email === 'unknown@crossmilescarrier.com'
            );
            
            if (shouldUpdate) {
                testChat.participants = [{
                    displayName: identifiedRecipient.name,
                    email: identifiedRecipient.email,
                    userId: identifiedRecipient.userId
                }];
                
                await testChat.save();
                console.log(`   ✅ Updated chat participant to: ${identifiedRecipient.name} (${identifiedRecipient.email})`);
            } else {
                console.log('   ℹ️  Chat participant already has better info, skipping update');
            }
        } else {
            console.log('\n   ⚠️  Could not identify recipient - keeping existing participant info');
        }
        
        console.log('\n✅ Debug analysis completed');
        
    } catch (error) {
        console.error('❌ Error during debug:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run the debug
debugTestChat();
