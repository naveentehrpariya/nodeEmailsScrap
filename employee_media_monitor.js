const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');
const util = require('util');
require('dotenv').config();

const execAsync = util.promisify(exec);
const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

class EmployeeMediaMonitor {
    constructor() {
        this.googleAuth = null;
        this.stats = {
            totalAttachments: 0,
            successfulDownloads: 0,
            failedDownloads: 0,
            skippedAttachments: 0
        };
    }

    async initialize() {
        console.log('🎯 Employee Media Monitoring System Initialized');
        console.log('📊 Designed for comprehensive employee communication oversight\n');
        
        // Initialize Google services
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
                console.log('✓ Google Workspace API access configured');
            }
        } catch (error) {
            console.log('⚠️ Google API access limited - using alternative methods');
        }

        // Ensure monitoring directory exists
        const monitoringDir = path.join(__dirname, 'employee_media');
        if (!fs.existsSync(monitoringDir)) {
            fs.mkdirSync(monitoringDir, { recursive: true });
            console.log('✓ Employee media monitoring directory created');
        }

        // Connect to employee data database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to employee communication database\n');
    }

    async downloadWithMultipleMethods(url, filePath, attachment) {
        const methods = [
            () => this.downloadWithWget(url, filePath),
            () => this.downloadWithCurl(url, filePath),
            () => this.downloadWithNodeHTTPS(url, filePath),
            () => this.downloadWithHeaders(url, filePath)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`   🔄 Attempt ${i + 1}/4: ${['wget', 'curl', 'node-https', 'headers'][i]}`);
                const result = await methods[i]();
                if (result && result > 0) {
                    return result;
                }
            } catch (error) {
                console.log(`   ❌ Method ${i + 1} failed: ${error.message.substring(0, 50)}`);
            }
        }
        throw new Error('All download methods failed');
    }

    async downloadWithWget(url, filePath) {
        try {
            const command = `wget -q --timeout=30 --tries=3 -O "${filePath}" "${url}"`;
            await execAsync(command);
            const stats = fs.statSync(filePath);
            return stats.size;
        } catch (error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw error;
        }
    }

    async downloadWithCurl(url, filePath) {
        try {
            const command = `curl -s -L --max-time 30 --retry 3 -o "${filePath}" "${url}"`;
            const { stdout } = await execAsync(`${command} && echo "OK"`);
            if (stdout.includes('OK')) {
                const stats = fs.statSync(filePath);
                return stats.size;
            }
            throw new Error('Curl download failed');
        } catch (error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw error;
        }
    }

    async downloadWithNodeHTTPS(url, filePath) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const protocol = urlObj.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none'
                    }
                };

                const request = protocol.request(options, (response) => {
                    if (response.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filePath);
                        let downloadedBytes = 0;

                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                        });

                        response.pipe(fileStream);
                        
                        fileStream.on('finish', () => {
                            fileStream.close();
                            resolve(downloadedBytes);
                        });

                        fileStream.on('error', (error) => {
                            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                            reject(error);
                        });
                    } else if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            this.downloadWithNodeHTTPS(redirectUrl, filePath).then(resolve).catch(reject);
                        } else {
                            reject(new Error('Redirect without location'));
                        }
                    } else {
                        reject(new Error(`HTTP ${response.statusCode}`));
                    }
                });

                request.on('error', reject);
                request.on('timeout', () => {
                    request.abort();
                    reject(new Error('Request timeout'));
                });

                request.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    async downloadWithHeaders(url, filePath) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const protocol = urlObj.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'GoogleBot/2.1 (+http://www.google.com/bot.html)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                };

                const request = protocol.request(options, (response) => {
                    if (response.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filePath);
                        let downloadedBytes = 0;

                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                        });

                        response.pipe(fileStream);
                        
                        fileStream.on('finish', () => {
                            fileStream.close();
                            resolve(downloadedBytes);
                        });

                        fileStream.on('error', (error) => {
                            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                            reject(error);
                        });
                    } else {
                        reject(new Error(`HTTP ${response.statusCode}`));
                    }
                });

                request.on('error', reject);
                request.on('timeout', () => {
                    request.abort();
                    reject(new Error('Request timeout'));
                });

                request.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    async downloadGoogleDriveFile(fileId) {
        if (!this.googleAuth) throw new Error('Google Drive API not available');
        
        try {
            const drive = google.drive({ version: 'v3', auth: this.googleAuth });
            const response = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Google Drive download failed: ${error.message}`);
        }
    }

    getFileExtension(contentType, contentName) {
        if (contentName && contentName.includes('.')) {
            return path.extname(contentName);
        }

        const extensionMap = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
            'video/mp4': '.mp4',
            'video/quicktime': '.mov',
            'video/avi': '.avi',
            'video/webm': '.webm',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'application/pdf': '.pdf',
            'text/plain': '.txt',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.ms-excel': '.xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
        };
        
        return extensionMap[contentType] || '.file';
    }

    async processEmployeeAttachment(attachment, employeeEmail, chatName, messageIndex, attachmentIndex) {
        try {
            console.log(`\n📄 Processing Employee Media:`);
            console.log(`   👤 Employee: ${employeeEmail}`);
            console.log(`   💬 Chat: ${chatName}`);
            console.log(`   📎 File: ${attachment.contentName || 'Unknown'}`);
            console.log(`   📏 Type: ${attachment.contentType}`);
            
            // Create employee-specific directory structure
            const safeEmployeeId = String(employeeEmail).replace(/[^a-zA-Z0-9]/g, '_');
            const employeeDir = path.join(__dirname, 'employee_media', safeEmployeeId);
            if (!fs.existsSync(employeeDir)) {
                fs.mkdirSync(employeeDir, { recursive: true });
            }

            // Generate filename with employee context
            const extension = this.getFileExtension(attachment.contentType, attachment.contentName);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeName = (attachment.contentName || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
            const filename = `${timestamp}_${safeName}${extension}`;
            const filePath = path.join(employeeDir, filename);

            let downloadSuccess = false;
            let fileSize = 0;
            let downloadMethod = '';

            // Method 1: Try Google Drive API for Drive files
            if (attachment.driveDataRef?.driveFileId) {
                try {
                    console.log('   📂 Attempting Google Drive API download...');
                    const driveData = await this.downloadGoogleDriveFile(attachment.driveDataRef.driveFileId);
                    fs.writeFileSync(filePath, driveData);
                    fileSize = fs.statSync(filePath).size;
                    downloadSuccess = true;
                    downloadMethod = 'google_drive_api';
                    console.log('   ✅ Downloaded via Google Drive API');
                } catch (driveError) {
                    console.log(`   ❌ Google Drive API failed: ${driveError.message}`);
                }
            }

            // Method 2: Try direct URL download with multiple methods
            if (!downloadSuccess && attachment.downloadUrl) {
                try {
                    console.log('   🌐 Attempting direct URL download...');
                    fileSize = await this.downloadWithMultipleMethods(attachment.downloadUrl, filePath, attachment);
                    downloadSuccess = true;
                    downloadMethod = 'direct_url';
                    console.log('   ✅ Downloaded via direct URL');
                } catch (directError) {
                    console.log(`   ❌ Direct URL failed: ${directError.message}`);
                }
            }

            // Method 3: Try thumbnail URL for images
            if (!downloadSuccess && attachment.thumbnailUrl && attachment.contentType?.includes('image')) {
                try {
                    console.log('   🖼️ Attempting thumbnail download...');
                    fileSize = await this.downloadWithMultipleMethods(attachment.thumbnailUrl, filePath, attachment);
                    downloadSuccess = true;
                    downloadMethod = 'thumbnail';
                    console.log('   ✅ Downloaded thumbnail version');
                } catch (thumbError) {
                    console.log(`   ❌ Thumbnail failed: ${thumbError.message}`);
                }
            }

            if (downloadSuccess && fileSize > 0) {
                // Verify file integrity
                let isValidFile = true;
                try {
                    const fileHeader = fs.readFileSync(filePath).slice(0, 100).toString();
                    if (fileHeader.includes('<html') || fileHeader.includes('<!DOCTYPE')) {
                        console.log('   ❌ File appears to be HTML error page');
                        isValidFile = false;
                    }
                } catch (e) {
                    // Binary files will throw error when converted to string, which is fine
                }

                if (isValidFile) {
                    console.log(`✅ EMPLOYEE MEDIA CAPTURED`);
                    console.log(`   📁 Saved: ${filename}`);
                    console.log(`   📊 Size: ${Math.round(fileSize / 1024)} KB`);
                    console.log(`   🔧 Method: ${downloadMethod}`);
                    
                    this.stats.successfulDownloads++;
                    
                    return {
                        filename: filename,
                        filePath: filePath,
                        size: fileSize,
                        method: downloadMethod,
                        employeeEmail: employeeEmail,
                        chatName: chatName,
                        downloadedAt: new Date(),
                        monitoringCapture: true
                    };
                } else {
                    fs.unlinkSync(filePath);
                }
            }

            console.log('❌ Failed to capture employee media');
            this.stats.failedDownloads++;
            return false;

        } catch (error) {
            console.log(`❌ Error processing employee media: ${error.message}`);
            this.stats.failedDownloads++;
            return false;
        }
    }

    async monitorAllEmployeeCommunications() {
        console.log('🎯 Starting Comprehensive Employee Communication Monitoring\n');
        
        // Find all employee communications with media
        const employeeChats = await Chat.find({});
        const chatsWithMedia = employeeChats.filter(chat => 
            chat.messages && 
            chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`📊 Monitoring ${chatsWithMedia.length} employee communication channels\n`);

        for (const chat of chatsWithMedia) {
            const employeeEmail = chat.account || 'unknown_employee';
            const chatName = chat.displayName || 'Unknown Chat';
            
            console.log(`\n👤 MONITORING EMPLOYEE: ${employeeEmail}`);
            console.log(`💬 Communication Channel: "${chatName}"`);
            console.log(`📨 Total Messages: ${chat.messages.length}`);

            let chatUpdated = false;

            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    console.log(`\n📧 Message ${messageIndex + 1} contains ${message.attachments.length} attachment(s)`);
                    
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        this.stats.totalAttachments++;

                        // Skip if already captured for monitoring
                        if (attachment.localPath && 
                            attachment.downloadStatus === 'completed' && 
                            attachment.monitoringDownload === true &&
                            !attachment.localPath.startsWith('sample_')) {
                            console.log(`⏭️ Already monitored: ${attachment.contentName}`);
                            this.stats.skippedAttachments++;
                            continue;
                        }

                        const result = await this.processEmployeeAttachment(
                            attachment, 
                            employeeEmail, 
                            chatName, 
                            messageIndex, 
                            attachmentIndex
                        );
                        
                        if (result) {
                            // Update database with monitoring info
                            message.attachments[attachmentIndex].downloadStatus = 'completed';
                            message.attachments[attachmentIndex].localPath = result.filename;
                            message.attachments[attachmentIndex].fileSize = result.size;
                            message.attachments[attachmentIndex].downloadedAt = result.downloadedAt;
                            message.attachments[attachmentIndex].downloadMethod = result.method;
                            message.attachments[attachmentIndex].monitoringDownload = true;
                            message.attachments[attachmentIndex].isRealMedia = true;
                            message.attachments[attachmentIndex].employeeEmail = result.employeeEmail;
                            message.attachments[attachmentIndex].monitoringCapture = true;
                            
                            chatUpdated = true;
                        } else {
                            message.attachments[attachmentIndex].downloadStatus = 'failed';
                            message.attachments[attachmentIndex].lastFailedAttempt = new Date();
                            chatUpdated = true;
                        }

                        // Respectful delay
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }

            // Save employee communication data
            if (chatUpdated) {
                await chat.save();
                console.log(`💾 Employee communication data updated: ${employeeEmail}`);
            }
        }

        this.printMonitoringReport();
    }

    printMonitoringReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🎯 EMPLOYEE COMMUNICATION MONITORING REPORT');
        console.log('='.repeat(80));
        console.log(`📊 Total media attachments found:     ${this.stats.totalAttachments}`);
        console.log(`⏭️  Previously monitored:             ${this.stats.skippedAttachments}`);
        console.log(`✅ Successfully captured:             ${this.stats.successfulDownloads}`);
        console.log(`❌ Failed to capture:                 ${this.stats.failedDownloads}`);
        
        const processedCount = this.stats.totalAttachments - this.stats.skippedAttachments;
        const successRate = processedCount > 0 ? ((this.stats.successfulDownloads / processedCount) * 100).toFixed(1) : 0;
        console.log(`📈 Monitoring success rate:           ${successRate}%`);
        console.log('='.repeat(80));

        if (this.stats.successfulDownloads > 0) {
            console.log('\n🎉 Employee media successfully captured for monitoring!');
            console.log(`📁 Monitoring data location: ${path.join(__dirname, 'employee_media')}`);
            console.log('🔍 Media organized by employee email address');
            console.log('🔄 Refresh your monitoring dashboard to review employee communications');
        } else if (this.stats.skippedAttachments > 0) {
            console.log('\n✨ All employee communications were already being monitored');
        } else {
            console.log('\n📝 No new employee media was found to monitor');
            console.log('💡 This could indicate:');
            console.log('   - Employees are not sharing media in monitored channels');
            console.log('   - Additional authentication may be required');
            console.log('   - Network access restrictions may apply');
        }

        console.log('\n' + '='.repeat(80));
    }

    async cleanup() {
        await mongoose.disconnect();
        console.log('👋 Employee monitoring session completed');
    }
}

// Execute employee monitoring
async function startEmployeeMonitoring() {
    const monitor = new EmployeeMediaMonitor();
    
    try {
        await monitor.initialize();
        await monitor.monitorAllEmployeeCommunications();
    } catch (error) {
        console.error('💥 Monitoring system error:', error);
    } finally {
        await monitor.cleanup();
    }
}

startEmployeeMonitoring().catch(console.error);
