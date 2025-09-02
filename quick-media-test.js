const mongoose = require('mongoose');
const Account = require('./db/Account');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

async function quickMediaTest() {
    try {
        console.log('🚀 Quick Media Download Test\n');
        
        require('dotenv').config();
        await mongoose.connect(process.env.DB_URL_OFFICE);
        await mediaProcessingService.initialize();
        
        const accounts = await Account.find({ deletedAt: { $exists: false } });
        const account = accounts[0];
        console.log(`Testing with: ${account.email}\n`);
        
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/gmail.readonly"
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            account.email
        );
        
        const chat = google.chat({ version: "v1", auth });
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        let testCount = 0;
        let successCount = 0;
        
        for (const space of spaces.slice(0, 2)) {
            console.log(`Checking space: ${space.displayName || space.name}`);
            
            const messageRes = await chat.spaces.messages.list({
                parent: space.name,
                pageSize: 5
            });
            
            const messages = messageRes.data.messages || [];
            
            for (const message of messages) {
                const fullMessage = await chat.spaces.messages.get({
                    name: message.name
                });
                
                const attachments = fullMessage.data.attachments || [];
                
                for (const attachment of attachments.slice(0, 1)) { // Test 1 per message
                    testCount++;
                    console.log(`\n📎 Testing: ${attachment.contentName}`);
                    console.log(`   Type: ${attachment.contentType}`);
                    console.log(`   ResourceName: ${attachment.attachmentDataRef?.resourceName ? 'YES' : 'NO'}`);
                    
                    if (attachment.attachmentDataRef?.resourceName) {
                        const processed = await mediaProcessingService.processGoogleChatAttachment(
                            attachment, 
                            fullMessage.data, 
                            auth
                        );
                        
                        const downloadResult = await mediaProcessingService.downloadFromChatAPI(processed, auth);
                        
                        if (downloadResult && downloadResult.fileSize > 1000) {
                            successCount++;
                            console.log(`   ✅ SUCCESS: ${Math.round(downloadResult.fileSize/1024)}KB downloaded`);
                        } else {
                            console.log(`   ❌ FAILED: ${downloadResult ? downloadResult.fileSize : 0} bytes`);
                        }
                    } else {
                        console.log(`   ⚠️ No resourceName available`);
                    }
                    
                    if (testCount >= 5) break; // Limit test
                }
                if (testCount >= 5) break;
            }
            if (testCount >= 5) break;
        }
        
        console.log(`\n📊 RESULTS:`);
        console.log(`- Tests attempted: ${testCount}`);
        console.log(`- Successful downloads: ${successCount}`);
        console.log(`- Success rate: ${testCount > 0 ? Math.round((successCount/testCount)*100) : 0}%`);
        
        // Verify files
        const fs = require('fs');
        const mediaDir = '/Users/naveentehrpariya/Work/EmailScrap/backend/media';
        const files = fs.readdirSync(mediaDir).filter(f => !f.includes('.DS_Store') && !f.includes('thumbnails'));
        
        console.log(`\n📁 Downloaded files:`);
        files.forEach(file => {
            const stats = fs.statSync(`${mediaDir}/${file}`);
            const fileCmd = require('child_process').execSync(`file "${mediaDir}/${file}"`).toString().trim();
            console.log(`  ${file} (${Math.round(stats.size/1024)}KB) - ${fileCmd.split(':')[1]}`);
        });
        
        if (successCount > 0) {
            console.log(`\n🎉 SUCCESS! Media downloads are working correctly!`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

quickMediaTest();
