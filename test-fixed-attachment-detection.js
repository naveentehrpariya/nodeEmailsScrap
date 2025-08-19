#!/usr/bin/env node

const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function findAttachmentsFixed() {
    console.log('🎯 FIXED: Searching for messages with attachments (corrected field names)...\n');
    
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
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 100,
                    orderBy: 'createTime desc'
                });
                
                const messages = messageRes.data.messages || [];
                totalMessages += messages.length;
                console.log(`   📨 ${messages.length} messages found`);
                
                let spaceAttachments = 0;
                
                // Check each message for attachments
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    
                    try {
                        const fullMessage = await chat.spaces.messages.get({
                            name: msg.name
                        });
                        
                        // FIXED: Check both 'attachments' (plural) and 'attachment' (singular) fields
                        const attachmentsPlural = fullMessage.data.attachments || [];
                        const attachmentSingular = fullMessage.data.attachment || [];
                        
                        const allAttachments = [...attachmentsPlural, ...attachmentSingular];
                        const hasAttachments = allAttachments.length > 0;
                        
                        if (hasAttachments) {
                            spaceAttachments += allAttachments.length;
                            totalAttachments += allAttachments.length;
                            
                            console.log(`\n   🎉 FOUND MESSAGE WITH ATTACHMENTS!`);
                            console.log(`      Message: ${i + 1}/${messages.length}`);
                            console.log(`      ID: ${fullMessage.data.name}`);
                            console.log(`      Text: "${(fullMessage.data.text || '(no text)').substring(0, 100)}..."`);
                            console.log(`      Created: ${new Date(fullMessage.data.createTime).toLocaleString()}`);
                            console.log(`      Sender: ${fullMessage.data.sender?.name || 'Unknown'}`);
                            console.log(`      Total attachments: ${allAttachments.length}`);
                            console.log(`      - From 'attachments' field: ${attachmentsPlural.length}`);
                            console.log(`      - From 'attachment' field: ${attachmentSingular.length}`);
                            
                            allAttachments.forEach((att, index) => {
                                console.log(`\n      📎 Attachment ${index + 1}:`);
                                console.log(`         Name: ${att.name || 'N/A'}`);
                                console.log(`         Content Name: ${att.contentName || 'N/A'}`);
                                console.log(`         Content Type: ${att.contentType || 'N/A'}`);
                                console.log(`         Source: ${att.source || 'N/A'}`);
                                
                                if (att.downloadUri) {
                                    console.log(`         📥 Download URL: Available (${att.downloadUri.length} chars)`);
                                }
                                
                                if (att.thumbnailUri) {
                                    console.log(`         🖼️ Thumbnail URL: Available (${att.thumbnailUri.length} chars)`);
                                }
                                
                                if (att.driveDataRef) {
                                    console.log(`         🔗 Google Drive File:`);
                                    console.log(`            File ID: ${att.driveDataRef.driveFileId || 'N/A'}`);
                                }
                                
                                if (att.attachmentDataRef) {
                                    console.log(`         📁 Chat Attachment:`);
                                    console.log(`            Resource: ${att.attachmentDataRef.resourceName ? 'Available' : 'N/A'}`);
                                }
                            });
                        } else if (i < 3) {
                            // Show first few messages for debugging
                            console.log(`      Message ${i + 1}: "${(fullMessage.data.text || '(no text)').substring(0, 50)}..." - No attachments`);
                        }
                        
                    } catch (msgError) {
                        console.log(`      ❌ Error getting message ${i + 1}: ${msgError.message}`);
                    }
                }
                
                console.log(`   📎 Attachments found in this space: ${spaceAttachments}\n`);
                
            } catch (spaceError) {
                console.log(`   ❌ Error accessing space: ${spaceError.message}\n`);
            }
        }
        
        console.log(`\n🎉 FINAL RESULTS:`);
        console.log(`   Total spaces checked: ${spaces.length}`);
        console.log(`   Total messages scanned: ${totalMessages}`);
        console.log(`   Total attachments found: ${totalAttachments}`);
        
        if (totalAttachments > 0) {
            console.log(`\n✅ SUCCESS! Your system is working perfectly!`);
            console.log(`   🎯 The issue was using 'attachments' instead of 'attachment' field`);
            console.log(`   📱 Now you can run your media processing pipeline`);
            console.log(`\n🚀 Next steps:`);
            console.log(`   1. Update your chat sync service to use 'attachment' field`);
            console.log(`   2. Run full chat sync to process these media files`);
            console.log(`   3. Check media directory for downloaded files`);
        } else {
            console.log(`\n❌ Still no attachments found. Check API permissions.`);
        }
        
    } catch (error) {
        console.error('❌ Failed to search for attachments:', error.message);
    }
}

findAttachmentsFixed().then(() => {
    console.log('\n✨ Fixed attachment search completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Search failed:', error);
    process.exit(1);
});
