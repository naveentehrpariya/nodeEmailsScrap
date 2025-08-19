const axios = require('axios');

async function testChatAPI() {
    try {
        console.log('🔍 Testing chat API endpoints...\n');
        
        // Test the chat list endpoint
        console.log('1. Testing GET /api/chat/list');
        const chatListResponse = await axios.get('http://localhost:8080/api/chat/list');
        console.log('Status:', chatListResponse.status);
        console.log('Response type:', typeof chatListResponse.data);
        console.log('Number of chats:', chatListResponse.data?.length || 'N/A');
        
        if (chatListResponse.data && chatListResponse.data.length > 0) {
            const sampleChat = chatListResponse.data[0];
            console.log('Sample chat structure:');
            console.log({
                id: sampleChat._id,
                displayName: sampleChat.displayName,
                messageCount: sampleChat.messages?.length || 0,
                hasMessages: !!sampleChat.messages
            });
            
            // Look for messages with attachments
            if (sampleChat.messages) {
                const messagesWithAttachments = sampleChat.messages.filter(msg => 
                    msg.attachments && msg.attachments.length > 0
                );
                
                console.log(`\n📎 Messages with attachments: ${messagesWithAttachments.length}`);
                
                messagesWithAttachments.forEach((msg, i) => {
                    console.log(`\n  Message ${i + 1}:`);
                    console.log(`    ID: ${msg.messageId}`);
                    console.log(`    Text: ${msg.text || '(no text)'}`);
                    console.log(`    Attachments: ${msg.attachments.length}`);
                    
                    msg.attachments.forEach((att, j) => {
                        console.log(`    Attachment ${j + 1}:`);
                        console.log(`      Filename: ${att.filename}`);
                        console.log(`      Type: ${att.mediaType}`);
                        console.log(`      MIME: ${att.mimeType}`);
                        console.log(`      LocalPath: ${att.localPath ? 'Yes' : 'No'}`);
                        console.log(`      Status: ${att.downloadStatus}`);
                        console.log(`      IsImage: ${att.isImage}`);
                        console.log(`      Size: ${att.fileSize} bytes`);
                        
                        if (att.localPath) {
                            const filename = att.localPath.split('/').pop();
                            console.log(`      API URL: /api/media/files/${filename}`);
                        }
                    });
                });
            }
        } else {
            console.log('❌ No chats found');
        }
        
        console.log('\n✅ Chat API test completed');
        
    } catch (error) {
        console.error('❌ Error testing chat API:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run if called directly
if (require.main === module) {
    testChatAPI()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = testChatAPI;
