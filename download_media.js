const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

// Initialize Google Auth
let auth;
try {
    const serviceAccountPath = path.join(__dirname, 'dispatch.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
        });
        console.log('✓ Google Auth initialized with service account');
    } else {
        console.error('❌ dispatch.json service account file not found');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ Failed to initialize Google Auth:', error);
    process.exit(1);
}

async function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✓ Created directory: ${dirPath}`);
    }
}

async function downloadAttachment(attachment, authClient, chat, messageIndex, attachmentIndex) {
    try {
        console.log(`\n📥 Downloading: ${attachment.name}`);
        console.log(`   Content Name: ${attachment.contentName}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Download URL: ${attachment.downloadUrl}`);

        const downloadUrl = attachment.downloadUrl || attachment.downloadUri;
        if (!downloadUrl) {
            console.log('❌ No download URL available');
            return false;
        }

        // Get access token
        const accessToken = await authClient.getAccessToken();
        if (!accessToken.token) {
            console.log('❌ Failed to get access token');
            return false;
        }

        // Download the file
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Accept': '*/*'
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        if (response.status !== 200) {
            console.log(`❌ Download failed with status: ${response.status}`);
            return false;
        }

        // Determine file extension from content type or use original
        let extension = '';
        if (attachment.contentType) {
            const typeMap = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'video/mp4': '.mp4',
                'video/avi': '.avi',
                'video/mov': '.mov',
                'application/pdf': '.pdf',
                'text/plain': '.txt',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
            };
            extension = typeMap[attachment.contentType] || '';
        }

        // Create filename
        const timestamp = Date.now();
        const filename = `attachment_${timestamp}_${messageIndex}_${attachmentIndex}${extension}`;
        const mediaDir = path.join(__dirname, 'media');
        await ensureDirectoryExists(mediaDir);
        const filePath = path.join(mediaDir, filename);

        // Write file
        fs.writeFileSync(filePath, Buffer.from(response.data));
        console.log(`✓ Downloaded to: ${filename}`);
        console.log(`✓ File size: ${response.data.byteLength} bytes`);

        return {
            filename: filename,
            filePath: filePath,
            size: response.data.byteLength
        };

    } catch (error) {
        console.log(`❌ Download failed:`, error.message);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Response: ${error.response.data?.toString?.() || 'No response data'}`);
        }
        return false;
    }
}

async function downloadAllMedia() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Get auth client
        const authClient = await auth.getClient();
        
        // Get all chats and filter manually
        const allChats = await Chat.find({});
        const chatsWithMedia = allChats.filter(chat => 
            chat.messages && chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`\\n📊 Found ${chatsWithMedia.length} chats with attachments`);

        let totalAttachments = 0;
        let successfulDownloads = 0;
        let failedDownloads = 0;

        for (const chat of chatsWithMedia) {
            console.log(`\\n🏷️  Chat: ${chat.displayName || chat.name || 'Unknown'}`);
            
            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        const result = await downloadAttachment(
                            attachment, 
                            authClient, 
                            chat, 
                            messageIndex, 
                            attachmentIndex
                        );
                        
                        if (result) {
                            successfulDownloads++;
                            
                            // Update attachment in database with local path
                            message.attachments[attachmentIndex].downloadStatus = 'completed';
                            message.attachments[attachmentIndex].localPath = result.filename;
                            message.attachments[attachmentIndex].fileSize = result.size;
                            
                            console.log(`✓ Updated database record`);
                        } else {
                            failedDownloads++;
                            message.attachments[attachmentIndex].downloadStatus = 'failed';
                        }
                        
                        // Small delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            // Save updated chat to database
            await chat.save();
            console.log(`✓ Saved chat to database`);
        }

        console.log(`\\n📈 DOWNLOAD SUMMARY:`);
        console.log(`   Total attachments: ${totalAttachments}`);
        console.log(`   Successful downloads: ${successfulDownloads}`);
        console.log(`   Failed downloads: ${failedDownloads}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✓ Disconnected from database');
    }
}

downloadAllMedia();
