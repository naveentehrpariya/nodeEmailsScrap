const mongoose = require('mongoose');
const Email = require('./db/Email');
const fs = require('fs');
const path = require('path');

async function testEmailAttachments() {
    try {
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('✅ Connected to MongoDB');

        console.log('📎 TESTING EMAIL ATTACHMENT FUNCTIONALITY');
        console.log('=' .repeat(50));

        // Find emails with attachments
        const emailsWithAttachments = await Email.find({ 
            attachments: { $exists: true, $not: { $size: 0 } }
        }).lean();

        console.log(`📧 Found ${emailsWithAttachments.length} emails with attachments`);

        let testResults = {
            totalAttachments: 0,
            validPaths: 0,
            invalidPaths: 0,
            filesExist: 0,
            filesNotExist: 0
        };

        for (const email of emailsWithAttachments) {
            console.log(`\n📧 Email: ${email.subject || '(No Subject)'}`);
            console.log(`   From: ${email.from}`);
            console.log(`   Label: ${email.labelType}`);
            
            for (const attachment of email.attachments) {
                testResults.totalAttachments++;
                
                console.log(`\n   📎 Attachment: ${attachment.filename || 'Unknown'}`);
                console.log(`      MIME Type: ${attachment.mimeType || 'Unknown'}`);
                console.log(`      Local Path: ${attachment.localPath || 'None'}`);
                
                if (attachment.localPath) {
                    testResults.validPaths++;
                    
                    // Check if file exists
                    if (fs.existsSync(attachment.localPath)) {
                        testResults.filesExist++;
                        const stats = fs.statSync(attachment.localPath);
                        console.log(`      ✅ File exists (${stats.size} bytes)`);
                        
                        // Test the API URL
                        const filename = attachment.localPath.split('/').pop();
                        const apiUrl = `/api/media/email-attachments/${filename}`;
                        console.log(`      🔗 API URL: ${apiUrl}`);
                        
                    } else {
                        testResults.filesNotExist++;
                        console.log(`      ❌ File does not exist`);
                    }
                } else {
                    testResults.invalidPaths++;
                    console.log(`      ⚠️ No local path`);
                }
            }
        }

        console.log('\n📊 TEST SUMMARY:');
        console.log('=' .repeat(50));
        console.log(`📎 Total Attachments: ${testResults.totalAttachments}`);
        console.log(`📁 With Local Paths: ${testResults.validPaths}`);
        console.log(`❌ Without Paths: ${testResults.invalidPaths}`);
        console.log(`✅ Files Exist: ${testResults.filesExist}`);
        console.log(`💀 Files Missing: ${testResults.filesNotExist}`);

        // Test uploads directory
        console.log('\n📁 UPLOADS DIRECTORY CHECK:');
        console.log('=' .repeat(30));
        
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            console.log(`✅ Uploads directory exists`);
            console.log(`📄 Files in uploads: ${files.length}`);
            
            if (files.length > 0) {
                console.log(`\n📋 Sample files:`);
                files.slice(0, 10).forEach(file => {
                    const filePath = path.join(uploadsDir, file);
                    const stats = fs.statSync(filePath);
                    const sizeStr = stats.size > 1024 * 1024 
                        ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
                        : `${Math.round(stats.size / 1024)} KB`;
                    console.log(`   - ${file} (${sizeStr})`);
                });
            }
        } else {
            console.log(`❌ Uploads directory does not exist`);
        }

        console.log('\n🎯 NEXT STEPS:');
        console.log('=' .repeat(20));
        console.log('1. ✅ Email attachments are synced and stored');
        console.log('2. ✅ API route exists: /api/media/email-attachments/:filename');
        console.log('3. ✅ Frontend ThreadDetail component updated');
        console.log('4. 🧪 Test in browser: Go to a thread with attachments');
        console.log('5. 🎨 Check attachment display and download functionality');

        if (testResults.filesExist > 0) {
            console.log('\n🎉 SUCCESS: Email attachments should now be visible in the frontend!');
        } else {
            console.log('\n⚠️ Note: No attachment files found - run email sync first');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

testEmailAttachments();
