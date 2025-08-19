#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function findAttachments() {
    console.log('🔍 Searching for messages with attachments...\n');
    
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
        console.log('📡 Connecting to Google Chat API...');
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        console.log(`✅ Found ${spaces.length} spaces to search\n`);
        
        let totalMessages = 0;
        let totalAttachments = 0;
        
        for (const space of spaces) {
            const spaceName = space.displayName || '(Direct Message)';
            console.log(`🔍 Searching space: ${spaceName}`);
            console.log(`   Space ID: ${space.name}`);
            
            try {
                // Get messages with different page sizes to be thorough
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 100,
                    showDeleted: false
                });
                
                const messages = messageRes.data.messages || [];
                totalMessages += messages.length;
                console.log(`   📨 ${messages.length} messages found`);
                
                let spaceAttachments = 0;
                
                // Check each message for attachments
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    
                    try {
                        // Get full message details - this is crucial for attachments
                        const fullMessage = await chat.spaces.messages.get({
                            name: msg.name
                        });
                        
                        const hasAttachments = (fullMessage.data.attachments && fullMessage.data.attachments.length > 0) || 
                                               (fullMessage.data.attachment && fullMessage.data.attachment.length > 0);
                        
                        if (hasAttachments) {
                            spaceAttachments += fullMessage.data.attachments.length;
                            totalAttachments += fullMessage.data.attachments.length;
                            
                            console.log(`\n   🎉 FOUND MESSAGE WITH ATTACHMENTS!`);
                            console.log(`      Message: ${i + 1}/${messages.length}`);
                            console.log(`      ID: ${fullMessage.data.name}`);
                            console.log(`      Text: "${(fullMessage.data.text || '(no text)').substring(0, 100)}..."`);
                            console.log(`      Created: ${fullMessage.data.createTime}`);
                            console.log(`      Sender: ${fullMessage.data.sender?.name || 'Unknown'}`);
                            console.log(`      Attachment count: ${fullMessage.data.attachments.length}`);
                            
                            fullMessage.data.attachments.forEach((att, index) => {
                                console.log(`\n      📎 Attachment ${index + 1}:`);
                                console.log(`         Name: ${att.name || 'N/A'}`);
                                console.log(`         Content Name: ${att.contentName || 'N/A'}`);
                                console.log(`         Content Type: ${att.contentType || 'N/A'}`);
                                console.log(`         Source: ${att.source || 'N/A'}`);
                                
                                if (att.driveDataRef) {
                                    console.log(`         🔗 Google Drive File:`);
                                    console.log(`            File ID: ${att.driveDataRef.driveFileId || 'N/A'}`);
                                }
                                
                                if (att.attachmentDataRef) {
                                    console.log(`         📁 Chat Attachment:`);
                                    console.log(`            Resource: ${att.attachmentDataRef.resourceName || 'N/A'}`);
                                }
                                
                                console.log(`         Raw data keys: ${Object.keys(att).join(', ')}`);
                            });
                        } else if (i < 5) {
                            // Show first few messages for debugging
                            console.log(`      Message ${i + 1}: "${(fullMessage.data.text || '(no text)').substring(0, 50)}..." - No attachments`);
                        }
                        
                    } catch (msgError) {
                        console.log(`      ❌ Error getting message ${i + 1}: ${msgError.message}`);
                    }
                    
                    // Add small delay to avoid rate limiting
                    if (i % 10 === 0 && i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                
                console.log(`   📎 Attachments in this space: ${spaceAttachments}\n`);
                
            } catch (spaceError) {
                console.log(`   ❌ Error accessing space: ${spaceError.message}\n`);
            }
        }
        
        console.log(`\n📊 FINAL RESULTS:`);
        console.log(`   Total spaces checked: ${spaces.length}`);
        console.log(`   Total messages scanned: ${totalMessages}`);
        console.log(`   Total attachments found: ${totalAttachments}`);
        
        if (totalAttachments === 0) {
            console.log(`\n💡 POSSIBLE REASONS FOR NO ATTACHMENTS:`);
            console.log(`   1. Messages genuinely don't have attachments`);
            console.log(`   2. Service account lacks proper permissions`);
            console.log(`   3. Domain-wide delegation not configured for attachments`);
            console.log(`   4. Attachments older than API retention period`);
            console.log(`   5. Attachment data requires different API endpoints`);
            
            console.log(`\n🔧 RECOMMENDED ACTIONS:`);
            console.log(`   1. Send a test message with image/file in Google Chat`);
            console.log(`   2. Check Google Admin Console > Security > API Controls`);
            console.log(`   3. Verify service account has Chat and Drive scopes`);
            console.log(`   4. Try with chat.bot scope for different access level`);
        }
        
    } catch (error) {
        console.error('❌ Failed to search for attachments:', error.message);
        
        if (error.message.includes('403')) {
            console.log('\n🔧 This is a permission error. Check:');
            console.log('   - Domain-wide delegation is enabled');
            console.log('   - All required scopes are authorized');
            console.log('   - Service account has proper roles');
        }
    }
}

findAttachments().then(() => {
    console.log('\n✨ Attachment search completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Search failed:', error);
    process.exit(1);
});
