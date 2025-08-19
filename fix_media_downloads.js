const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { google } = require('googleapis');

// MongoDB connection
const mongoUri = 'mongodb+srv://naveen:8qOcKHjZSbGlW9kH@cluster0.sn7ib.mongodb.net/emailScrap';

// Load authentication from dispatch.json
async function loadAuth() {
    try {
        const dispatchData = await fs.readFile('./dispatch.json', 'utf8');
        const dispatch = JSON.parse(dispatchData);
        
        const serviceAccount = {
            type: 'service_account',
            project_id: dispatch.project_id,
            private_key_id: dispatch.private_key_id,
            private_key: dispatch.private_key.replace(/\\n/g, '\n'),
            client_email: dispatch.client_email,
            client_id: dispatch.client_id,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token'
        };
        
        const auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: [
                'https://www.googleapis.com/auth/chat.messages.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        });
        
        return await auth.getClient();
    } catch (error) {
        console.error('Error loading authentication:', error.message);
        throw error;
    }
}

// Download a file with proper authentication
async function downloadFile(url, outputPath, auth) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get access token from auth client
            const accessToken = await auth.getAccessToken();
            
            const options = {
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                    'User-Agent': 'Mozilla/5.0 (compatible; GoogleChatMediaDownloader/1.0)'
                }
            };
            
            const request = https.get(url, options, (response) => {
                console.log(`Download ${path.basename(outputPath)}: HTTP ${response.statusCode}`);
                
                if (response.statusCode === 302 || response.statusCode === 301) {
                    console.log(`Redirect to: ${response.headers.location}`);
                    return downloadFile(response.headers.location, outputPath, auth)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    const contentType = response.headers['content-type'] || '';
                    if (contentType.includes('text/html')) {
                        console.error(`❌ Authentication failed for ${path.basename(outputPath)} - got HTML response`);
                        reject(new Error(`Authentication failed - got HTML response (${response.statusCode})`));
                        return;
                    } else {
                        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                        return;
                    }
                }
                
                const fileStream = require('fs').createWriteStream(outputPath);
                
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✅ Downloaded: ${path.basename(outputPath)}`);
                    resolve();
                });
                
                fileStream.on('error', reject);
            });
            
            request.on('error', reject);
            
        } catch (error) {
            reject(error);
        }
    });
}

async function fixMediaDownloads() {
    let client;
    
    try {
        // Connect to MongoDB
        client = new MongoClient(mongoUri);
        await client.connect();
        console.log('Connected to MongoDB');
        
        const db = client.db('emailScrap');
        
        // Load authentication
        console.log('Loading authentication...');
        const auth = await loadAuth();
        console.log('✅ Authentication loaded successfully');
        
        // Find all chats with attachments
        const chats = await db.collection('chats').find({
            'messages.attachments': { $exists: true, $ne: [] }
        }).toArray();
        
        console.log(`Found ${chats.length} chats with attachments`);
        
        let totalAttachments = 0;
        let successfulDownloads = 0;
        let failedDownloads = 0;
        
        // Process each chat
        for (const chat of chats) {
            console.log(`\n--- Processing chat: ${chat.name || 'Direct Chat'} ---`);
            
            for (const message of chat.messages || []) {
                if (message.attachments && message.attachments.length > 0) {
                    
                    for (const attachment of message.attachments) {
                        totalAttachments++;
                        
                        console.log(`\n${totalAttachments}. Processing: ${attachment.name || 'unnamed'}`);
                        console.log(`   Content Type: ${attachment.contentType}`);
                        console.log(`   Local Path: ${attachment.localPath}`);
                        console.log(`   Download Status: ${attachment.downloadStatus}`);
                        
                        // Check if we have a downloadUrl
                        if (!attachment.downloadUrl) {
                            console.log('   ❌ No download URL available');
                            failedDownloads++;
                            continue;
                        }
                        
                        // Determine the file path
                        const fileName = attachment.localPath || attachment.name || `unknown_${Date.now()}`;
                        const filePath = path.join('./media', fileName);
                        
                        try {
                            // Create media directory if it doesn't exist
                            await fs.mkdir('./media', { recursive: true });
                            
                            // Download the file
                            console.log(`   📥 Downloading from: ${attachment.downloadUrl.substring(0, 100)}...`);
                            await downloadFile(attachment.downloadUrl, filePath, auth);
                            
                            // Verify the file was downloaded and is not HTML
                            const fileStats = await fs.stat(filePath);
                            console.log(`   📊 File size: ${fileStats.size} bytes`);
                            
                            if (fileStats.size < 1000) {
                                // Check if it's an HTML error page
                                const fileContent = await fs.readFile(filePath, 'utf8');
                                if (fileContent.includes('<!doctype html>') || fileContent.includes('<html')) {
                                    console.log('   ❌ Downloaded file is HTML (authentication error)');
                                    failedDownloads++;
                                    continue;
                                }
                            }
                            
                            // Update the attachment status in the database
                            await db.collection('chats').updateOne(
                                { 
                                    _id: chat._id,
                                    'messages.attachments.name': attachment.name
                                },
                                {
                                    $set: {
                                        'messages.$.attachments.$[att].downloadStatus': 'completed',
                                        'messages.$.attachments.$[att].localPath': fileName
                                    }
                                },
                                {
                                    arrayFilters: [{ 'att.name': attachment.name }]
                                }
                            );
                            
                            successfulDownloads++;
                            console.log(`   ✅ Successfully downloaded and updated database`);
                            
                        } catch (error) {
                            console.log(`   ❌ Failed to download: ${error.message}`);
                            failedDownloads++;
                        }
                        
                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Total attachments found: ${totalAttachments}`);
        console.log(`Successful downloads: ${successfulDownloads}`);
        console.log(`Failed downloads: ${failedDownloads}`);
        
    } catch (error) {
        console.error('Error fixing media downloads:', error);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

// Run the fix
fixMediaDownloads().catch(console.error);
