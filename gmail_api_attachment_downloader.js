const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Connect to MongoDB with proper settings
mongoose.set('strictQuery', true);
mongoose.connect(process.env.DB_URL_OFFICE || 'mongodb://localhost:27017/emailscrapper');

const Chat = require('./db/Chat');

async function initializeGmailAPI() {
    try {
        console.log('📧 Initializing Gmail API with domain-wide delegation...');
        
        const serviceAccountPath = path.join(__dirname, 'dispatch.json');
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error('dispatch.json service account file not found');
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Use domain-wide delegation (this worked in diagnosis!)
        const auth = new google.auth.JWT(
            serviceAccount.client_email,
            null,
            serviceAccount.private_key,
            ['https://www.googleapis.com/auth/gmail.readonly'],
            'naveendev@crossmilescarrier.com'
        );

        const gmail = google.gmail({ version: 'v1', auth });
        console.log('✓ Gmail API initialized with domain-wide delegation');
        
        return { gmail, auth };
        
    } catch (error) {
        console.error('❌ Failed to initialize Gmail API:', error.message);
        throw error;
    }
}

async function searchGmailForAttachment(attachment, gmail) {
    try {
        console.log(`📧 Searching Gmail for attachment: ${attachment.contentName}`);
        
        // Search for messages containing this attachment name
        const searchQuery = `filename:"${attachment.contentName}" OR "${attachment.contentName}"`;
        console.log(`   Search query: ${searchQuery}`);
        
        const searchResults = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery,
            maxResults: 10
        });
        
        if (!searchResults.data.messages || searchResults.data.messages.length === 0) {
            console.log('   ❌ No Gmail messages found with this attachment');
            return null;
        }
        
        console.log(`   ✓ Found ${searchResults.data.messages.length} potential Gmail messages`);
        
        // Check each message for the attachment
        for (const message of searchResults.data.messages) {
            try {
                const fullMessage = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'full'
                });
                
                console.log(`   📧 Checking message ${message.id}...`);
                
                // Look for attachments in the message
                const attachments = await extractAttachmentsFromGmailMessage(fullMessage.data, gmail);
                
                // Find matching attachment by name
                const matchingAttachment = attachments.find(att => 
                    att.filename === attachment.contentName ||
                    att.filename === attachment.filename
                );
                
                if (matchingAttachment) {
                    console.log(`   ✅ Found matching attachment in Gmail message ${message.id}`);
                    return matchingAttachment;
                }
                
            } catch (messageError) {
                console.log(`   ⚠️  Error checking message ${message.id}: ${messageError.message}`);
            }
        }
        
        console.log('   ❌ No matching attachments found in Gmail messages');
        return null;
        
    } catch (error) {
        console.log(`   ❌ Gmail search failed: ${error.message}`);
        return null;
    }
}

async function extractAttachmentsFromGmailMessage(message, gmail) {
    const attachments = [];
    
    function extractFromPart(part) {
        if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
            attachments.push({
                filename: part.filename,
                mimeType: part.mimeType,
                attachmentId: part.body.attachmentId,
                messageId: message.id,
                size: part.body.size
            });
        }
        
        if (part.parts) {
            part.parts.forEach(extractFromPart);
        }
    }
    
    if (message.payload) {
        if (message.payload.parts) {
            message.payload.parts.forEach(extractFromPart);
        } else {
            extractFromPart(message.payload);
        }
    }
    
    return attachments;
}

async function downloadGmailAttachment(gmailAttachment, gmail, targetFilename) {
    try {
        console.log(`   💾 Downloading Gmail attachment: ${gmailAttachment.filename}`);
        
        const attachmentData = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: gmailAttachment.messageId,
            id: gmailAttachment.attachmentId
        });
        
        if (!attachmentData.data || !attachmentData.data.data) {
            throw new Error('No attachment data received');
        }
        
        // Decode base64 data
        const buffer = Buffer.from(attachmentData.data.data, 'base64');
        
        // Save to file
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        
        const filePath = path.join(mediaDir, targetFilename);
        fs.writeFileSync(filePath, buffer);
        
        const fileSize = fs.statSync(filePath).size;
        console.log(`   ✅ Downloaded via Gmail API: ${targetFilename} (${fileSize} bytes)`);
        
        return { success: true, filename: targetFilename, size: fileSize, method: 'gmail-api' };
        
    } catch (error) {
        console.log(`   ❌ Gmail download failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function getFileExtension(contentType, contentName) {
    // Try to get extension from content name first
    if (contentName && contentName.includes('.')) {
        const ext = path.extname(contentName);
        if (ext) return ext;
    }

    // Fallback to content type mapping
    const typeMap = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg', 
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'video/avi': '.avi',
        'application/pdf': '.pdf',
        'text/plain': '.txt'
    };
    
    return typeMap[contentType] || '.bin';
}

async function downloadAttachmentViaGmail(attachment, gmail) {
    try {
        console.log(`\n📥 Processing: ${attachment.contentName || attachment.filename}`);
        console.log(`   Type: ${attachment.contentType}`);
        
        // Generate proper filename
        const extension = getFileExtension(attachment.contentType, attachment.contentName);
        const cleanName = (attachment.contentName || attachment.filename || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${cleanName}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        const filePath = path.join(mediaDir, filename);
        
        // Skip if file already exists and is not small
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 1000) { // Only skip if file is reasonably sized
                console.log(`⏭️  File already exists: ${filename} (${stats.size} bytes)`);
                return { success: true, filename, size: stats.size, skipped: true };
            }
        }
        
        // Search Gmail for this attachment
        const gmailAttachment = await searchGmailForAttachment(attachment, gmail);
        
        if (!gmailAttachment) {
            console.log('❌ Attachment not found in Gmail');
            return { success: false, error: 'Not found in Gmail' };
        }
        
        // Download the attachment from Gmail
        const result = await downloadGmailAttachment(gmailAttachment, gmail, filename);
        return result;
        
    } catch (error) {
        console.error(`❌ Download error for ${attachment.contentName}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function downloadAllAttachmentsViaGmail() {
    try {
        console.log('🚀 Starting Gmail API attachment download...');
        
        const { gmail } = await initializeGmailAPI();
        
        // Find all chats with attachments
        const chats = await Chat.find({
            messages: { 
                $elemMatch: { 
                    attachments: { 
                        $exists: true, 
                        $not: { $size: 0 } 
                    } 
                } 
            }
        });
        
        console.log(`📊 Found ${chats.length} chats with attachments`);
        
        let totalAttachments = 0;
        let successfulDownloads = 0;
        let skippedDownloads = 0;
        let failedDownloads = 0;
        
        for (const chat of chats) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (const message of chat.messages) {
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        totalAttachments++;
                        
                        console.log(`\n--- Attachment ${totalAttachments} ---`);
                        
                        const result = await downloadAttachmentViaGmail(attachment, gmail);
                        
                        if (result.success) {
                            if (result.skipped) {
                                skippedDownloads++;
                            } else {
                                successfulDownloads++;
                            }
                        } else {
                            failedDownloads++;
                        }
                        
                        // Small delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
        }
        
        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`   📊 Total attachments: ${totalAttachments}`);
        console.log(`   ✅ Successful downloads: ${successfulDownloads}`);
        console.log(`   ⏭️  Skipped (already exist): ${skippedDownloads}`);
        console.log(`   ❌ Failed downloads: ${failedDownloads}`);
        console.log(`   📈 Success rate: ${(((successfulDownloads + skippedDownloads) / totalAttachments) * 100).toFixed(1)}%`);
        
        // List all downloaded files
        const mediaDir = path.join(__dirname, 'media');
        const files = fs.readdirSync(mediaDir)
            .filter(f => !f.startsWith('.') && !f.startsWith('sample') && !f.includes('html'))
            .sort();
        
        console.log(`\n📁 Files in media directory (${files.length}):`);
        files.forEach(file => {
            const filePath = path.join(mediaDir, file);
            const stats = fs.statSync(filePath);
            const sizeStr = stats.size > 1024 * 1024 
                ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.round(stats.size / 1024)} KB`;
            console.log(`   ${file} (${sizeStr})`);
        });
        
        if (successfulDownloads > 0) {
            console.log(`\n🎉 SUCCESS! Downloaded ${successfulDownloads} real Gmail attachments!`);
            console.log('   You can now view actual content in your chat application.');
        }
        
    } catch (error) {
        console.error('❌ Error downloading attachments:', error);
    } finally {
        mongoose.disconnect();
        console.log('\n👋 Disconnected from database');
    }
}

// Run the download
downloadAllAttachmentsViaGmail();
