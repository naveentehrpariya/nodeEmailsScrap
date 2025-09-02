#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const Email = require('./db/Email');
const Thread = require('./db/Thread');
const Account = require('./db/Account');

async function debugFrontendIntegration() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔍 DEBUGGING FRONTEND INTEGRATION');
        console.log('==================================\n');
        
        // Find the email with IMG_9351.png
        const targetEmail = await Email.findOne({
            'attachments.filename': 'IMG_9351.png'
        }).populate('thread');
        
        if (!targetEmail) {
            console.log('❌ Email with IMG_9351.png not found');
            return;
        }
        
        console.log('📧 FOUND TARGET EMAIL:');
        console.log(`   Subject: "${targetEmail.subject}"`);
        console.log(`   Thread ID: ${targetEmail.thread._id}`);
        console.log(`   Account: ${targetEmail.thread.account}`);
        console.log(`   Label: ${targetEmail.labelType}`);
        
        // Show the attachment structure as it should be sent to frontend
        console.log('\n📎 ATTACHMENT STRUCTURE FOR FRONTEND:');
        const attachment = targetEmail.attachments.find(att => att.filename === 'IMG_9351.png');
        
        if (attachment) {
            const filename = path.basename(attachment.localPath);
            
            // This is what the frontend should receive
            const frontendAttachment = {
                filename: attachment.filename,
                originalName: attachment.filename,
                mimeType: attachment.mimeType,
                localPath: attachment.localPath,
                // The key URLs for frontend
                downloadUrl: `/api/media/email-attachments/${filename}`,
                previewUrl: `/api/media/email-attachments/${filename}`,
                directUrl: `http://localhost:8080/api/media/email-attachments/${filename}`,
                // Metadata for UI logic
                isImage: attachment.mimeType?.startsWith('image/'),
                isPdf: attachment.mimeType === 'application/pdf',
                isVideo: attachment.mimeType?.startsWith('video/'),
                // File info
                fileSize: null, // Would need to be calculated
                fileExtension: path.extname(attachment.filename).toLowerCase()
            };
            
            console.log('Frontend attachment object:');
            console.log(JSON.stringify(frontendAttachment, null, 2));
            
            console.log('\n🌐 TESTING URLS:');
            console.log(`✅ Direct URL (works): ${frontendAttachment.directUrl}`);
            console.log(`📱 Test page: http://localhost:8080/api/media/test/${filename}`);
            
        } else {
            console.log('❌ IMG_9351.png attachment not found in email');
        }
        
        // Check what the API endpoints should return
        console.log('\n🔗 API ENDPOINT STRUCTURE:');
        console.log('The email API should return attachment data like this:');
        
        const emailApiResponse = {
            _id: targetEmail._id,
            subject: targetEmail.subject,
            from: targetEmail.from,
            to: targetEmail.to,
            body: targetEmail.body,
            attachments: targetEmail.attachments.map(att => {
                const filename = path.basename(att.localPath);
                return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    downloadUrl: `/api/media/email-attachments/${filename}`,
                    previewUrl: `/api/media/email-attachments/${filename}`,
                    isImage: att.mimeType?.startsWith('image/'),
                    isPdf: att.mimeType === 'application/pdf'
                };
            })
        };
        
        console.log('\nExample API response structure:');
        console.log(JSON.stringify(emailApiResponse, null, 2));
        
        // Frontend debugging tips
        console.log('\n🐛 FRONTEND DEBUGGING CHECKLIST:');
        console.log('================================');
        console.log('1. ✅ Backend URL works: http://localhost:8080/api/media/email-attachments/198ec0753d729cf5_IMG_9351.png');
        console.log('2. ❓ Check your frontend email API call - does it include attachment URLs?');
        console.log('3. ❓ Check browser Network tab - are image requests being made?');
        console.log('4. ❓ Check browser Console - any CORS or loading errors?');
        console.log('5. ❓ Check img src attribute - is it the full URL or relative path?');
        
        console.log('\n💻 FRONTEND FIXES TO TRY:');
        console.log('=========================');
        
        console.log('\n1. If using relative URLs, make sure they include the full path:');
        console.log(`   ❌ Wrong: src="198ec0753d729cf5_IMG_9351.png"`);
        console.log(`   ❌ Wrong: src="/attachments/198ec0753d729cf5_IMG_9351.png"`);
        console.log(`   ✅ Correct: src="/api/media/email-attachments/198ec0753d729cf5_IMG_9351.png"`);
        
        console.log('\n2. If using full URLs, make sure they include the protocol and host:');
        console.log(`   ✅ Correct: src="http://localhost:8080/api/media/email-attachments/198ec0753d729cf5_IMG_9351.png"`);
        
        console.log('\n3. Example React/JavaScript code:');
        console.log(`
// React component example
const AttachmentPreview = ({ attachment }) => {
    const imageUrl = \`/api/media/email-attachments/\${attachment.filename}\`;
    
    if (attachment.isImage) {
        return (
            <img 
                src={imageUrl} 
                alt={attachment.filename}
                style={{ maxWidth: '100%', height: 'auto' }}
                onError={(e) => {
                    console.error('Image failed to load:', imageUrl);
                    e.target.src = '/placeholder-image.png'; // fallback
                }}
                onLoad={() => console.log('Image loaded successfully:', imageUrl)}
            />
        );
    }
    return <span>{attachment.filename}</span>;
};
        `);
        
        console.log('\n4. Example HTML/vanilla JavaScript:');
        console.log(`
<img id="attachment-image" alt="Loading..." />

<script>
const attachment = ${JSON.stringify(frontendAttachment, null, 4)};

const imgElement = document.getElementById('attachment-image');
imgElement.src = attachment.previewUrl; // or attachment.directUrl
imgElement.alt = attachment.filename;

imgElement.onload = () => console.log('✅ Image loaded successfully');
imgElement.onerror = () => console.error('❌ Image failed to load:', attachment.previewUrl);
</script>
        `);
        
        console.log('\n5. Browser Network Tab Check:');
        console.log('   - Open Developer Tools → Network tab');
        console.log('   - Reload the page');
        console.log('   - Look for requests to /api/media/email-attachments/');
        console.log('   - Check if they return 200 OK or any errors');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the debug
debugFrontendIntegration().catch(console.error);
