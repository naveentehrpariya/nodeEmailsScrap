const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const puppeteer = require('puppeteer');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

class AdvancedMediaDownloader {
    constructor() {
        this.browser = null;
        this.page = null;
        this.googleAuth = null;
        this.stats = {
            total: 0,
            downloaded: 0,
            failed: 0,
            skipped: 0
        };
    }

    async initialize() {
        console.log('🚀 Initializing Advanced Media Downloader for Employee Monitoring...');
        
        // Initialize Google Auth
        try {
            const serviceAccountPath = path.join(__dirname, 'dispatch.json');
            if (fs.existsSync(serviceAccountPath)) {
                this.googleAuth = new google.auth.GoogleAuth({
                    keyFile: serviceAccountPath,
                    scopes: [
                        'https://www.googleapis.com/auth/chat.messages.readonly',
                        'https://www.googleapis.com/auth/chat.spaces.readonly',
                        'https://www.googleapis.com/auth/drive.readonly'
                    ]
                });
                console.log('✓ Google Auth initialized');
            }
        } catch (error) {
            console.log('⚠️ Google Auth failed, will use alternative methods');
        }

        // Initialize Puppeteer for browser automation
        try {
            this.browser = await puppeteer.launch({
                headless: false, // Set to false for debugging
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--user-data-dir=/tmp/chrome-user-data'
                ]
            });
            this.page = await this.browser.newPage();
            
            // Set user agent
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            console.log('✓ Browser automation initialized');
        } catch (error) {
            console.log('⚠️ Browser automation failed:', error.message);
        }

        // Ensure media directory exists
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
            console.log('✓ Media directory created');
        }

        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');
    }

    async downloadWithBrowser(url, filePath) {
        if (!this.page) throw new Error('Browser not initialized');
        
        try {
            console.log('   🌐 Using browser automation...');
            
            // Navigate to the URL
            const response = await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            if (response.ok()) {
                // Get the response buffer
                const buffer = await response.buffer();
                fs.writeFileSync(filePath, buffer);
                console.log(`   📥 Downloaded ${buffer.length} bytes via browser`);
                return buffer.length;
            } else {
                throw new Error(`HTTP ${response.status()}`);
            }
        } catch (error) {
            throw new Error(`Browser download failed: ${error.message}`);
        }
    }

    async downloadWithCurl(url, filePath, cookies = null) {
        return new Promise((resolve, reject) => {
            let curlCommand = `curl -s -o "${filePath}" -w "%{http_code}" "${url}"`;
            
            if (cookies) {
                curlCommand = `curl -s -o "${filePath}" -w "%{http_code}" -H "Cookie: ${cookies}" "${url}"`;
            }

            const { exec } = require('child_process');
            exec(curlCommand, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                const httpCode = parseInt(stdout.trim());
                if (httpCode === 200) {
                    const stats = fs.statSync(filePath);
                    resolve(stats.size);
                } else {
                    // Delete failed download
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    reject(new Error(`HTTP ${httpCode}`));
                }
            });
        });
    }

    async downloadWithGoogleDriveAPI(driveFileId) {
        if (!this.googleAuth) throw new Error('Google Auth not available');
        
        try {
            const drive = google.drive({ version: 'v3', auth: this.googleAuth });
            const response = await drive.files.get({
                fileId: driveFileId,
                alt: 'media'
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Google Drive API failed: ${error.message}`);
        }
    }

    getFileExtension(contentType, contentName) {
        if (contentName && contentName.includes('.')) {
            return path.extname(contentName);
        }

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

    async downloadAttachment(attachment, messageIndex, attachmentIndex) {
        try {
            console.log(`\n📥 Processing: ${attachment.contentName || 'Unknown'}`);
            console.log(`   Type: ${attachment.contentType}`);
            console.log(`   Size: ${attachment.fileSize ? Math.round(attachment.fileSize / 1024) + ' KB' : 'Unknown'}`);

            // Generate filename
            const extension = this.getFileExtension(attachment.contentType, attachment.contentName);
            const timestamp = Date.now();
            const safeName = (attachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
            const filename = `emp_monitor_${timestamp}_${safeName}${extension}`;
            const filePath = path.join(__dirname, 'media', filename);

            let downloadSuccess = false;
            let fileSize = 0;
            let downloadMethod = null;

            // Method 1: Try Google Drive API if it's a Drive file
            if (attachment.driveDataRef?.driveFileId) {
                try {
                    console.log('   📂 Trying Google Drive API...');
                    const data = await this.downloadWithGoogleDriveAPI(attachment.driveDataRef.driveFileId);
                    fs.writeFileSync(filePath, data);
                    fileSize = fs.statSync(filePath).size;
                    downloadSuccess = true;
                    downloadMethod = 'drive_api';
                    console.log('   ✅ Downloaded via Google Drive API');
                } catch (driveError) {
                    console.log(`   ❌ Drive API failed: ${driveError.message}`);
                }
            }

            // Method 2: Try direct URL with various approaches
            if (!downloadSuccess && attachment.downloadUrl) {
                const methods = [
                    { name: 'Browser Automation', func: () => this.downloadWithBrowser(attachment.downloadUrl, filePath) },
                    { name: 'cURL with cookies', func: () => this.downloadWithCurl(attachment.downloadUrl, filePath, 'session=active') },
                    { name: 'cURL simple', func: () => this.downloadWithCurl(attachment.downloadUrl, filePath) }
                ];

                for (const method of methods) {
                    if (downloadSuccess) break;
                    
                    try {
                        console.log(`   🔄 Trying ${method.name}...`);
                        fileSize = await method.func();
                        downloadSuccess = true;
                        downloadMethod = method.name.toLowerCase().replace(' ', '_');
                        console.log(`   ✅ Downloaded via ${method.name}`);
                    } catch (error) {
                        console.log(`   ❌ ${method.name} failed: ${error.message}`);
                    }
                }
            }

            // Method 3: Try thumbnail URL as fallback for images
            if (!downloadSuccess && attachment.thumbnailUrl && attachment.contentType?.startsWith('image/')) {
                try {
                    console.log('   🖼️ Trying thumbnail URL...');
                    fileSize = await this.downloadWithCurl(attachment.thumbnailUrl, filePath);
                    downloadSuccess = true;
                    downloadMethod = 'thumbnail';
                    console.log('   ✅ Downloaded thumbnail version');
                } catch (thumbError) {
                    console.log(`   ❌ Thumbnail failed: ${thumbError.message}`);
                }
            }

            if (downloadSuccess && fileSize > 0) {
                // Verify file is not HTML error page
                const fileContent = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).substring(0, 200);
                if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE')) {
                    console.log('   ❌ File is HTML error page, deleting...');
                    fs.unlinkSync(filePath);
                    return false;
                }

                console.log(`✅ SUCCESS: ${filename} (${Math.round(fileSize / 1024)} KB)`);
                this.stats.downloaded++;
                
                return {
                    filename,
                    filePath,
                    size: fileSize,
                    method: downloadMethod,
                    timestamp: new Date()
                };
            } else {
                console.log('❌ All download methods failed');
                this.stats.failed++;
                return false;
            }

        } catch (error) {
            console.log(`❌ Error processing attachment: ${error.message}`);
            this.stats.failed++;
            return false;
        }
    }

    async downloadAllMedia() {
        console.log('\n🎯 Starting Employee Monitoring Media Download...');
        
        // Find all chats with attachments
        const allChats = await Chat.find({});
        const chatsWithMedia = allChats.filter(chat => 
            chat.messages && 
            chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`\n📊 Found ${chatsWithMedia.length} chats with media attachments`);

        for (const chat of chatsWithMedia) {
            console.log(`\n💬 Processing chat: "${chat.displayName || 'Unknown'}"`);
            console.log(`   Account: ${chat.account}`);
            console.log(`   Messages: ${chat.messages.length}`);

            let chatUpdated = false;

            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        this.stats.total++;

                        // Skip if already downloaded successfully
                        if (attachment.localPath && 
                            attachment.downloadStatus === 'completed' && 
                            attachment.isRealMedia === true &&
                            !attachment.localPath.startsWith('sample_')) {
                            console.log(`⏭️ Skipping already downloaded: ${attachment.contentName}`);
                            this.stats.skipped++;
                            continue;
                        }

                        const result = await this.downloadAttachment(attachment, messageIndex, attachmentIndex);
                        
                        if (result) {
                            // Update database record
                            message.attachments[attachmentIndex].downloadStatus = 'completed';
                            message.attachments[attachmentIndex].localPath = result.filename;
                            message.attachments[attachmentIndex].fileSize = result.size;
                            message.attachments[attachmentIndex].downloadedAt = result.timestamp;
                            message.attachments[attachmentIndex].downloadMethod = result.method;
                            message.attachments[attachmentIndex].isRealMedia = true;
                            message.attachments[attachmentIndex].monitoringDownload = true; // Flag for employee monitoring
                            
                            chatUpdated = true;
                            console.log('   💾 Database updated');
                        } else {
                            message.attachments[attachmentIndex].downloadStatus = 'failed';
                            message.attachments[attachmentIndex].lastFailedAttempt = new Date();
                            chatUpdated = true;
                        }

                        // Respectful delay between downloads
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }

            // Save chat if updated
            if (chatUpdated) {
                await chat.save();
                console.log(`💾 Saved chat: "${chat.displayName}"`);
            }
        }

        this.printStats();
    }

    printStats() {
        console.log('\n' + '='.repeat(60));
        console.log('🎯 EMPLOYEE MONITORING MEDIA DOWNLOAD RESULTS');
        console.log('='.repeat(60));
        console.log(`📊 Total attachments found:     ${this.stats.total}`);
        console.log(`⏭️  Already downloaded:         ${this.stats.skipped}`);
        console.log(`✅ Successfully downloaded:     ${this.stats.downloaded}`);
        console.log(`❌ Failed downloads:            ${this.stats.failed}`);
        console.log(`📈 Success rate:               ${this.stats.total > 0 ? ((this.stats.downloaded / (this.stats.total - this.stats.skipped)) * 100).toFixed(1) : 0}%`);
        console.log('='.repeat(60));

        if (this.stats.downloaded > 0) {
            console.log('\n🎉 Employee media successfully downloaded!');
            console.log(`📁 Media files location: ${path.join(__dirname, 'media')}`);
            console.log('🔄 Refresh your monitoring dashboard to view content');
        } else if (this.stats.skipped > 0) {
            console.log('\n✨ All employee media was already downloaded');
        } else {
            console.log('\n😕 No new media was downloaded');
            console.log('💡 Consider checking Google Chat permissions or trying OAuth2 authentication');
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log('🧹 Browser closed');
        }
        
        await mongoose.disconnect();
        console.log('👋 Database disconnected');
    }
}

// Main execution
async function main() {
    const downloader = new AdvancedMediaDownloader();
    
    try {
        await downloader.initialize();
        await downloader.downloadAllMedia();
    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await downloader.cleanup();
    }
}

// Check if puppeteer is available
try {
    require.resolve('puppeteer');
    main().catch(console.error);
} catch (e) {
    console.log('📦 Installing puppeteer for browser automation...');
    console.log('Run: npm install puppeteer');
    console.log('Then run this script again');
}
