#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Email = require('./db/Email');
const Thread = require('./db/Thread');
const Account = require('./db/Account');

async function debugAttachmentServing() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔧 DEBUGGING ATTACHMENT SERVING');
        console.log('================================\n');
        
        // 1. Check emails with attachments in database
        console.log('📧 CHECKING EMAILS WITH ATTACHMENTS:');
        const emailsWithAttachments = await Email.find({
            attachments: { $exists: true, $not: { $size: 0 } },
            deletedAt: { $exists: false }
        }).populate('thread').limit(5);
        
        console.log(`Found ${emailsWithAttachments.length} emails with attachments:`);
        
        for (const email of emailsWithAttachments) {
            console.log(`\n📧 Email: "${email.subject}"`);
            console.log(`   Account: ${email.thread?.account}`);
            console.log(`   Thread: ${email.thread?._id}`);
            console.log(`   Attachments (${email.attachments.length}):`);
            
            for (const attachment of email.attachments) {
                console.log(`     - ${attachment.filename}`);
                console.log(`       MIME Type: ${attachment.mimeType}`);
                console.log(`       Local Path: ${attachment.localPath}`);
                
                // Check if file exists
                try {
                    await fs.access(attachment.localPath);
                    const stats = await fs.stat(attachment.localPath);
                    console.log(`       ✅ File exists (${(stats.size / 1024).toFixed(1)}KB)`);
                    
                    // Generate the URL for this attachment
                    const filename = path.basename(attachment.localPath);
                    const attachmentUrl = `/api/media/email-attachments/${filename}`;
                    console.log(`       🔗 URL: ${attachmentUrl}`);
                    
                } catch (error) {
                    console.log(`       ❌ File missing: ${error.message}`);
                }
            }
        }
        
        // 2. Check uploads directory
        console.log('\n📁 CHECKING UPLOADS DIRECTORY:');
        const uploadsDir = path.join(__dirname, 'uploads');
        
        try {
            const files = await fs.readdir(uploadsDir);
            console.log(`Found ${files.length} files in uploads directory:`);
            
            // Show some sample files
            const sampleFiles = files.slice(0, 10);
            for (const file of sampleFiles) {
                try {
                    const filePath = path.join(uploadsDir, file);
                    const stats = await fs.stat(filePath);
                    const size = (stats.size / 1024).toFixed(1);
                    console.log(`  📎 ${file} (${size}KB)`);
                } catch (error) {
                    console.log(`  ❌ Error reading ${file}: ${error.message}`);
                }
            }
            
            if (files.length > 10) {
                console.log(`  ... and ${files.length - 10} more files`);
            }
            
        } catch (error) {
            console.log(`❌ Error reading uploads directory: ${error.message}`);
        }
        
        // 3. Test attachment URL structure
        console.log('\n🔗 TESTING ATTACHMENT URL STRUCTURE:');
        if (emailsWithAttachments.length > 0) {
            const testEmail = emailsWithAttachments[0];
            if (testEmail.attachments.length > 0) {
                const testAttachment = testEmail.attachments[0];
                const filename = path.basename(testAttachment.localPath);
                
                console.log(`Test attachment: ${testAttachment.filename}`);
                console.log(`Expected URL: /api/media/email-attachments/${filename}`);
                console.log(`Direct test URL: http://localhost:8080/api/media/test/${filename}`);
                
                // Check if it's an image
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                const ext = path.extname(filename).toLowerCase();
                if (imageExtensions.includes(ext)) {
                    console.log(`✅ This is an image file - should preview correctly`);
                } else {
                    console.log(`📄 This is a ${testAttachment.mimeType} file`);
                }
            }
        }
        
        // 4. Check for potential issues
        console.log('\n🔍 CHECKING FOR COMMON ISSUES:');
        
        // Check for missing files
        let missingFiles = 0;
        let existingFiles = 0;
        
        for (const email of emailsWithAttachments) {
            for (const attachment of email.attachments) {
                try {
                    await fs.access(attachment.localPath);
                    existingFiles++;
                } catch (error) {
                    missingFiles++;
                }
            }
        }
        
        console.log(`📊 File Status:`);
        console.log(`   ✅ Existing files: ${existingFiles}`);
        console.log(`   ❌ Missing files: ${missingFiles}`);
        
        if (missingFiles > 0) {
            console.log(`\n⚠️  Warning: ${missingFiles} attachment files are missing from disk`);
            console.log(`   This could cause 404 errors when trying to view attachments`);
        }
        
        // 5. Show example attachment structure for frontend
        console.log('\n💻 EXAMPLE FRONTEND ATTACHMENT STRUCTURE:');
        if (emailsWithAttachments.length > 0) {
            const exampleEmail = emailsWithAttachments[0];
            const frontendAttachments = exampleEmail.attachments.map(att => {
                const filename = path.basename(att.localPath);
                return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    downloadUrl: `/api/media/email-attachments/${filename}`,
                    previewUrl: `/api/media/email-attachments/${filename}`,
                    isImage: att.mimeType?.startsWith('image/'),
                    isPdf: att.mimeType === 'application/pdf'
                };
            });
            
            console.log('Example attachment data for frontend:');
            console.log(JSON.stringify(frontendAttachments, null, 2));
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the debug
debugAttachmentServing().catch(console.error);
