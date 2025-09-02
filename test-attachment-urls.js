#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
require('dotenv').config();

const Email = require('./db/Email');

async function testAttachmentUrls() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🧪 TESTING ATTACHMENT URLS');
        console.log('===========================\n');
        
        // Get emails with attachments
        const emailsWithAttachments = await Email.find({
            $and: [
                { attachments: { $exists: true } },
                { 'attachments.0': { $exists: true } }
            ]
        }).limit(10);
        
        console.log(`Found ${emailsWithAttachments.length} emails with attachments:\n`);
        
        const attachmentReport = [];
        
        for (const email of emailsWithAttachments) {
            console.log(`📧 Email: "${email.subject}"`);
            console.log(`   Attachments: ${email.attachments.length}`);
            
            for (const attachment of email.attachments) {
                const filename = path.basename(attachment.localPath);
                const attachmentUrl = `/api/media/email-attachments/${filename}`;
                const fullUrl = `http://localhost:8080${attachmentUrl}`;
                
                console.log(`   📎 ${attachment.filename}`);
                console.log(`      Type: ${attachment.mimeType}`);
                console.log(`      File: ${filename}`);
                console.log(`      URL: ${attachmentUrl}`);
                
                // Check if file exists
                let fileExists = false;
                let fileSize = 0;
                try {
                    await fs.access(attachment.localPath);
                    const stats = await fs.stat(attachment.localPath);
                    fileExists = true;
                    fileSize = stats.size;
                    console.log(`      ✅ File exists (${(fileSize / 1024).toFixed(1)}KB)`);
                } catch (error) {
                    console.log(`      ❌ File missing`);
                }
                
                // Test HTTP endpoint
                let httpStatus = 'Unknown';
                if (fileExists) {
                    try {
                        const response = await new Promise((resolve, reject) => {
                            const req = http.request(fullUrl, { method: 'HEAD' }, (res) => {
                                resolve(res);
                            });
                            req.on('error', reject);
                            req.setTimeout(5000, () => reject(new Error('Timeout')));
                            req.end();
                        });
                        
                        httpStatus = `${response.statusCode} ${response.statusMessage}`;
                        console.log(`      🌐 HTTP: ${httpStatus}`);
                        
                        if (response.statusCode === 200) {
                            console.log(`      📱 Preview URL: http://localhost:8080/api/media/test/${filename}`);
                        }
                        
                    } catch (error) {
                        httpStatus = `Error: ${error.message}`;
                        console.log(`      ❌ HTTP Error: ${error.message}`);
                    }
                }
                
                // Add to report
                attachmentReport.push({
                    emailSubject: email.subject,
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    localPath: attachment.localPath,
                    fileExists,
                    fileSize,
                    httpStatus,
                    url: attachmentUrl,
                    fullUrl: fullUrl,
                    testUrl: `http://localhost:8080/api/media/test/${filename}`,
                    isImage: attachment.mimeType?.startsWith('image/'),
                    isPdf: attachment.mimeType === 'application/pdf'
                });
                
                console.log(''); // Empty line for readability
            }
            console.log(''); // Empty line between emails
        }
        
        // Summary
        console.log('📊 ATTACHMENT SUMMARY:');
        console.log('======================');
        const totalAttachments = attachmentReport.length;
        const existingFiles = attachmentReport.filter(a => a.fileExists).length;
        const workingUrls = attachmentReport.filter(a => a.httpStatus.startsWith('200')).length;
        const images = attachmentReport.filter(a => a.isImage).length;
        const pdfs = attachmentReport.filter(a => a.isPdf).length;
        
        console.log(`Total attachments: ${totalAttachments}`);
        console.log(`Files on disk: ${existingFiles}/${totalAttachments} (${((existingFiles/totalAttachments)*100).toFixed(1)}%)`);
        console.log(`Working URLs: ${workingUrls}/${totalAttachments} (${((workingUrls/totalAttachments)*100).toFixed(1)}%)`);
        console.log(`Images: ${images} (${((images/totalAttachments)*100).toFixed(1)}%)`);
        console.log(`PDFs: ${pdfs} (${((pdfs/totalAttachments)*100).toFixed(1)}%)`);
        
        // Frontend integration example
        console.log('\\n💻 FRONTEND INTEGRATION EXAMPLE:');
        console.log('=================================');
        
        const workingAttachments = attachmentReport.filter(a => a.httpStatus.startsWith('200'));
        if (workingAttachments.length > 0) {
            const example = workingAttachments[0];
            
            console.log('JavaScript example for frontend:');
            console.log(`
// Example email attachment object
const attachment = {
    filename: "${example.filename}",
    mimeType: "${example.mimeType}",
    url: "${example.url}",
    isImage: ${example.isImage},
    isPdf: ${example.isPdf}
};

// For image preview
if (attachment.isImage) {
    const img = document.createElement('img');
    img.src = attachment.url;
    img.alt = attachment.filename;
    img.style.maxWidth = '100%';
    document.body.appendChild(img);
}

// For PDF preview
if (attachment.isPdf) {
    const embed = document.createElement('embed');
    embed.src = attachment.url;
    embed.type = 'application/pdf';
    embed.width = '100%';
    embed.height = '600px';
    document.body.appendChild(embed);
}

// For download link
const downloadLink = document.createElement('a');
downloadLink.href = attachment.url + '?download=' + encodeURIComponent(attachment.filename);
downloadLink.textContent = 'Download ' + attachment.filename;
downloadLink.download = attachment.filename;
document.body.appendChild(downloadLink);
            `);
            
            console.log(`\\nTest this attachment directly in browser:`);
            console.log(`${example.testUrl}`);
        }
        
        // Generate test URLs
        console.log('\\n🔗 TEST URLS FOR BROWSER:');
        console.log('===========================');
        workingAttachments.slice(0, 5).forEach((att, i) => {
            console.log(`${i+1}. ${att.filename}`);
            console.log(`   Direct: ${att.fullUrl}`);
            console.log(`   Test page: ${att.testUrl}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    }
}

// Run the test
testAttachmentUrls().catch(console.error);
