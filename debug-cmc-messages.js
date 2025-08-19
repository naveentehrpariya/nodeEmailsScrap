#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function debugCMCMessages() {
    console.log('🔬 DEEP DEBUG: Analyzing CMC space messages in detail...\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly", 
        "https://www.googleapis.com/auth/drive.readonly"
    ];

    const auth = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        SCOPES,
        userEmail
    );

    const chat = google.chat({ version: 'v1', auth });
    
    try {
        console.log('📋 Focusing on CMC space where media was sent...');
        
        // Find CMC space specifically
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        const cmcSpace = spaces.find(space => space.displayName === 'CMC');
        
        if (!cmcSpace) {
            console.log('❌ CMC space not found!');
            return;
        }
        
        console.log(`✅ Found CMC space: ${cmcSpace.name}`);
        
        // Get ALL messages from CMC space with different parameters
        console.log('\n🔍 Fetching messages with different API parameters...');
        
        // Method 1: Standard fetch
        console.log('\n📋 Method 1: Standard message fetch');
        const messageRes1 = await chat.spaces.messages.list({
            parent: cmcSpace.name,
            pageSize: 10,
            orderBy: 'createTime desc'
        });
        
        const messages1 = messageRes1.data.messages || [];
        console.log(`   Found ${messages1.length} messages`);
        
        // Method 2: With showDeleted true
        console.log('\n📋 Method 2: With showDeleted=true');
        const messageRes2 = await chat.spaces.messages.list({
            parent: cmcSpace.name,
            pageSize: 10,
            showDeleted: true,
            orderBy: 'createTime desc'
        });
        
        const messages2 = messageRes2.data.messages || [];
        console.log(`   Found ${messages2.length} messages`);
        
        // Method 3: Without orderBy
        console.log('\n📋 Method 3: Without orderBy parameter');
        const messageRes3 = await chat.spaces.messages.list({
            parent: cmcSpace.name,
            pageSize: 10
        });
        
        const messages3 = messageRes3.data.messages || [];
        console.log(`   Found ${messages3.length} messages`);
        
        // Analyze the most recent messages (should include the media ones)
        console.log('\n🔍 DETAILED ANALYSIS OF RECENT MESSAGES:');
        
        const messagesToAnalyze = messages1.length > 0 ? messages1 : messages2;
        
        for (let i = 0; i < messagesToAnalyze.length; i++) {
            const msg = messagesToAnalyze[i];
            
            console.log(`\n📨 Message ${i + 1}:`);
            console.log(`   ID: ${msg.name}`);
            console.log(`   Time: ${new Date(msg.createTime).toLocaleString()}`);
            console.log(`   Text: "${msg.text || '(no text)'}"`);
            console.log(`   Sender: ${msg.sender?.name || 'Unknown'}`);
            
            // Get FULL message details
            try {
                const fullMsg = await chat.spaces.messages.get({
                    name: msg.name
                });
                
                console.log(`   Full message keys: [${Object.keys(fullMsg.data).join(', ')}]`);
                console.log(`   Has attachments key: ${fullMsg.data.hasOwnProperty('attachments')}`);
                
                if (fullMsg.data.attachments) {
                    console.log(`   🎉 ATTACHMENTS FOUND: ${fullMsg.data.attachments.length}`);
                    console.log(`   Attachment details:`, JSON.stringify(fullMsg.data.attachments, null, 2));
                } else {
                    console.log(`   ❌ No attachments field in message`);
                }
                
                // Show the complete message structure for media messages
                if (fullMsg.data.text === null || fullMsg.data.text === '' || fullMsg.data.text === undefined) {
                    console.log(`   🔬 EMPTY TEXT MESSAGE - FULL STRUCTURE:`);
                    console.log(JSON.stringify(fullMsg.data, null, 2));
                }
                
            } catch (msgError) {
                console.log(`   ❌ Error getting full message: ${msgError.message}`);
            }
        }
        
        // Test if there's a different API endpoint or version needed
        console.log('\n🔍 Testing alternative approaches...');
        
        try {
            // Check if space details give us more info
            const spaceDetail = await chat.spaces.get({
                name: cmcSpace.name
            });
            
            console.log(`\n📋 Space details:`, Object.keys(spaceDetail.data));
            
        } catch (error) {
            console.log(`❌ Space detail failed: ${error.message}`);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
    
    console.log('\n💡 ANALYSIS COMPLETE');
    console.log('\nIf the messages with "(no text)" still show no attachments,');
    console.log('this indicates a fundamental API limitation or permission issue.');
    console.log('\nPossible causes:');
    console.log('1. Service account permissions insufficient for media');
    console.log('2. Domain security policy blocking attachment metadata');  
    console.log('3. Google Chat API limitation for service accounts');
    console.log('4. Files were shared via Drive links, not true attachments');
    console.log('5. API caching - may need to wait longer for propagation');
}

debugCMCMessages().then(() => {
    console.log('\n✨ Deep debug completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Debug failed:', error);
    process.exit(1);
});
