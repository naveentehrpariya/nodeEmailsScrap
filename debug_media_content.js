const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function debugDownloadContent() {
    try {
        console.log('🔍 DEBUG: Examining what we actually download...\n');
        
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Get CMC chat
        const cmcChat = await Chat.findOne({ displayName: 'CMC' });
        if (!cmcChat || !cmcChat.messages.length) {
            console.log('❌ No CMC chat found');
            return;
        }

        // Get first message with attachment
        const messageWithAttachment = cmcChat.messages.find(msg => 
            msg.attachments && msg.attachments.length > 0
        );

        if (!messageWithAttachment) {
            console.log('❌ No message with attachments');
            return;
        }

        const attachment = messageWithAttachment.attachments[0];
        console.log(`📎 Attachment: ${attachment.contentName}`);
        console.log(`   Type: ${attachment.contentType}`);
        console.log(`   Download URL exists: ${!!attachment.downloadUrl}`);

        if (!attachment.downloadUrl) {
            console.log('❌ No download URL available');
            return;
        }

        const mediaDir = path.join(__dirname, 'media');
        const debugFile = path.join(mediaDir, 'debug_download.html');

        // Download without authentication to see what we get
        try {
            console.log('\n🔓 Downloading without auth for debug...');
            const response = await axios({
                method: 'GET',
                url: attachment.downloadUrl,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            });

            console.log(`   Status: ${response.status}`);
            console.log(`   Content-Type: ${response.headers['content-type']}`);
            console.log(`   Content-Length: ${response.headers['content-length']}`);
            console.log(`   Size: ${response.data.byteLength} bytes`);

            // Save the response
            fs.writeFileSync(debugFile, response.data);
            
            // Examine the content
            const textContent = response.data.toString('utf8', 0, 500);
            console.log(`\n📄 Content Preview (first 500 chars):`);
            console.log('═'.repeat(60));
            console.log(textContent);
            console.log('═'.repeat(60));

            // Check if it's HTML
            const isHtml = textContent.includes('<html') || textContent.includes('<!DOCTYPE');
            console.log(`\n🤔 Is HTML?: ${isHtml}`);

            if (isHtml) {
                // Look for specific error messages or redirect URLs
                const redirectMatch = textContent.match(/url=([^"']+)/i);
                const errorMatch = textContent.match(/error[^<]*|unauthorized[^<]*/gi);
                
                if (redirectMatch) {
                    console.log(`🔄 Found redirect URL: ${redirectMatch[1]}`);
                }
                if (errorMatch) {
                    console.log(`❌ Found error messages: ${errorMatch.join(', ')}`);
                }

                // Look for any other URLs that might be the real download link
                const urlMatches = textContent.match(/https?:\/\/[^\s"'<>]+/gi);
                if (urlMatches) {
                    console.log(`\n🔗 Found URLs in content:`);
                    urlMatches.slice(0, 3).forEach((url, i) => {
                        console.log(`   ${i + 1}. ${url.substring(0, 80)}...`);
                    });
                }
            } else {
                // Check if it might be binary data
                const binaryContent = response.data.slice(0, 16);
                const hexDump = Array.from(binaryContent).map(b => b.toString(16).padStart(2, '0')).join(' ');
                console.log(`\n📊 Binary header (hex): ${hexDump}`);
                
                // Check for common file signatures
                const signatures = {
                    'PNG': [0x89, 0x50, 0x4E, 0x47],
                    'JPEG': [0xFF, 0xD8, 0xFF],
                    'PDF': [0x25, 0x50, 0x44, 0x46],
                    'MP4': [0x66, 0x74, 0x79, 0x70]
                };
                
                for (const [type, signature] of Object.entries(signatures)) {
                    if (signature.every((byte, i) => binaryContent[i] === byte)) {
                        console.log(`🎯 DETECTED: ${type} file format!`);
                        break;
                    }
                }
            }

            console.log(`\n💾 Debug file saved: ${debugFile}`);

        } catch (error) {
            console.log(`❌ Download failed: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Headers:`, error.response.headers);
            }
        }

    } catch (error) {
        console.error('💥 Debug error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debugDownloadContent();
