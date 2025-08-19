#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function testAdvancedAttachmentFetching() {
    console.log('🔧 Testing advanced attachment fetching strategies...\n');
    
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    // Strategy 1: Test with expanded scopes including bot access
    console.log('📋 Strategy 1: Testing with expanded scopes...');
    
    const EXPANDED_SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly", 
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/chat.bot",
        "https://www.googleapis.com/auth/chat.messages",
        "https://www.googleapis.com/auth/drive.file"
    ];

    try {
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            EXPANDED_SCOPES,
            userEmail
        );

        const chat = google.chat({ version: 'v1', auth });
        
        // Test API access first
        console.log('   Testing API access...');
        const spaceRes = await chat.spaces.list();
        console.log('   ✅ API access successful with expanded scopes');
        
        const spaces = spaceRes.data.spaces || [];
        console.log(`   📁 Found ${spaces.length} spaces`);
        
        // Strategy 2: Use different message fetching approaches
        console.log('\n📋 Strategy 2: Testing different message fetching methods...');
        
        for (const space of spaces.slice(0, 2)) { // Test first 2 spaces
            console.log(`\n   🔍 Testing space: ${space.displayName || '(Direct Message)'}`);
            
            // Method A: Standard list with different parameters
            console.log('      Method A: Standard list with expanded parameters');
            try {
                const messages1 = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 100,
                    showDeleted: true,
                    filter: '', // Try without filter
                    orderBy: 'createTime desc'
                });
                
                console.log(`         Found ${messages1.data.messages?.length || 0} messages`);
                
                // Check first message in detail
                if (messages1.data.messages && messages1.data.messages.length > 0) {
                    const firstMsg = messages1.data.messages[0];
                    
                    // Get with different parameters
                    const detailedMsg = await chat.spaces.messages.get({
                        name: firstMsg.name
                    });
                    
                    console.log(`         First message keys: ${Object.keys(detailedMsg.data).join(', ')}`);
                    console.log(`         Has attachments field: ${detailedMsg.data.hasOwnProperty('attachments')}`);
                    console.log(`         Attachments value: ${JSON.stringify(detailedMsg.data.attachments)}`);
                    
                    if (detailedMsg.data.attachments) {
                        console.log(`         🎉 ATTACHMENTS FOUND: ${detailedMsg.data.attachments.length}`);
                    }
                }
                
            } catch (error) {
                console.log(`         ❌ Method A failed: ${error.message}`);
            }
            
            // Method B: Try with different pagination
            console.log('      Method B: Pagination approach');
            try {
                let pageToken = null;
                let totalChecked = 0;
                
                do {
                    const pageReq = {
                        parent: space.name,
                        pageSize: 25,
                        pageToken: pageToken
                    };
                    
                    const pageRes = await chat.spaces.messages.list(pageReq);
                    const messages = pageRes.data.messages || [];
                    totalChecked += messages.length;
                    
                    console.log(`         Page: ${messages.length} messages (total: ${totalChecked})`);
                    
                    // Check each message on this page
                    for (const msg of messages) {
                        const fullMsg = await chat.spaces.messages.get({ name: msg.name });
                        if (fullMsg.data.attachments && fullMsg.data.attachments.length > 0) {
                            console.log(`         🎉 FOUND ATTACHMENTS: ${fullMsg.data.attachments.length} in message ${msg.name}`);
                            console.log(`         Message text: "${(fullMsg.data.text || '').substring(0, 100)}..."`);
                        }
                    }
                    
                    pageToken = pageRes.data.nextPageToken;
                    
                } while (pageToken && totalChecked < 50); // Limit to avoid too many API calls
                
                console.log(`         Total messages checked: ${totalChecked}`);
                
            } catch (error) {
                console.log(`         ❌ Method B failed: ${error.message}`);
            }
        }
        
        // Strategy 3: Check if we need different API version or endpoint
        console.log('\n📋 Strategy 3: Testing different API approaches...');
        
        try {
            // Test with spaces.get to see if we get more metadata
            const firstSpace = spaces[0];
            const spaceDetail = await chat.spaces.get({
                name: firstSpace.name
            });
            
            console.log(`   Space detail keys: ${Object.keys(spaceDetail.data).join(', ')}`);
            
        } catch (error) {
            console.log(`   ❌ Space detail failed: ${error.message}`);
        }
        
        // Strategy 4: Test Drive API access (for Drive attachments)
        console.log('\n📋 Strategy 4: Testing Google Drive API access...');
        
        try {
            const drive = google.drive({ version: 'v3', auth });
            const driveTest = await drive.about.get({ fields: 'user' });
            console.log(`   ✅ Drive API accessible for user: ${driveTest.data.user?.emailAddress}`);
            
            // Try to list recent Drive files that might be shared in chat
            const recentFiles = await drive.files.list({
                pageSize: 10,
                orderBy: 'modifiedTime desc',
                fields: 'files(id,name,mimeType,sharedWithMeTime,shared)'
            });
            
            console.log(`   📁 Recent Drive files: ${recentFiles.data.files?.length || 0}`);
            
            recentFiles.data.files?.forEach(file => {
                console.log(`      - ${file.name} (${file.mimeType}) - Shared: ${file.shared}`);
            });
            
        } catch (error) {
            console.log(`   ❌ Drive API failed: ${error.message}`);
        }
        
    } catch (error) {
        console.error(`❌ Advanced testing failed: ${error.message}`);
        
        // Strategy 5: Diagnose the exact permission issue
        console.log('\n📋 Strategy 5: Permission diagnosis...');
        
        if (error.message.includes('403')) {
            console.log('   🔍 403 Error - Permission denied. This indicates:');
            console.log('      1. Service account lacks required scopes');
            console.log('      2. Domain-wide delegation not properly configured');
            console.log('      3. User email not in allowed domain');
            console.log('      4. Specific scopes not authorized in Admin Console');
        }
        
        if (error.message.includes('404')) {
            console.log('   🔍 404 Error - Resource not found. This indicates:');
            console.log('      1. Space/message IDs are incorrect');
            console.log('      2. Messages have been deleted');
            console.log('      3. API endpoint URL is wrong');
        }
    }
    
    console.log('\n🏁 RECOMMENDATIONS BASED ON TESTING:');
    console.log('\n1. 📤 IMMEDIATE ACTION NEEDED:');
    console.log('   • Open Google Chat (chat.google.com)');  
    console.log('   • Go to the "CMC" space or any direct message');
    console.log('   • Send a NEW message with an image/file attachment');
    console.log('   • Wait 1-2 minutes, then re-run this test');
    
    console.log('\n2. 🔐 VERIFY PERMISSIONS:');
    console.log('   • Google Admin Console > Security > API Controls');
    console.log('   • Check Domain-wide delegation for your service account');
    console.log('   • Ensure these scopes are authorized:');
    console.log('     - https://www.googleapis.com/auth/chat.messages.readonly');
    console.log('     - https://www.googleapis.com/auth/drive.readonly');
    
    console.log('\n3. 🧪 TEST SCENARIOS:');
    console.log('   A. Send image from computer (should create attachment)');
    console.log('   B. Send file from Google Drive (should create Drive reference)');
    console.log('   C. Send document/PDF (should create document attachment)');
    
    console.log('\n4. 🔍 DEBUGGING:');
    console.log('   • Check if messages appear in Google Chat web interface');
    console.log('   • Verify attachments are visible in the UI');
    console.log('   • Note the attachment types (image, file, Drive link)');
}

testAdvancedAttachmentFetching().then(() => {
    console.log('\n✨ Advanced attachment testing completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Testing failed:', error);
    process.exit(1);
});
