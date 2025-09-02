const mongoose = require('mongoose');
const Account = require('./db/Account');
const Chat = require('./db/Chat');
const { google } = require('googleapis');
const keys = require('./dispatch.json');
const mediaProcessingService = require('./services/mediaProcessingService');

async function debugMediaSync() {
    try {
        console.log('🔍 Starting Media Sync Debug...\n');
        
        // Connect to MongoDB using the correct cloud database
        require('dotenv').config();
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✅ Connected to MongoDB');
        
        // Initialize media service
        await mediaProcessingService.initialize();
        console.log('✅ Media service initialized');
        
        // Check for accounts
        const accounts = await Account.find({ deletedAt: { $exists: false } });
        console.log(`📊 Found ${accounts.length} accounts in database`);
        
        if (accounts.length === 0) {
            console.log('❌ No accounts found in database. Cannot test media sync.');
            return;
        }
        
        // Test with first account
        const account = accounts[0];
        console.log(`🧪 Testing with account: ${account.email}\n`);
        
        // Setup auth
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/gmail.readonly"
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            account.email
        );
        
        console.log('✅ Auth configured');
        
        // Get Chat API
        const chat = google.chat({ version: "v1", auth });
        
        // Fetch spaces
        console.log('🔍 Fetching spaces...');
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        console.log(`📊 Found ${spaces.length} spaces`);
        
        let totalMessages = 0;
        let messagesWithAttachments = 0;
        let totalAttachments = 0;
        let attachmentsWithResourceName = 0;
        let downloadAttempts = 0;
        let successfulDownloads = 0;
        
        // Check first few spaces for attachments
        for (const space of spaces.slice(0, 3)) {
            console.log(`\n🔍 Checking space: ${space.displayName || space.name}`);
            
            try {
                const messageRes = await chat.spaces.messages.list({
                    parent: space.name,
                    pageSize: 20
                });
                
                const messages = messageRes.data.messages || [];
                totalMessages += messages.length;
                console.log(`  📨 Found ${messages.length} messages`);
                
                for (const message of messages) {
                    // Get full message details
                    const fullMessage = await chat.spaces.messages.get({
                        name: message.name
                    });
                    
                    const attachments = fullMessage.data.attachments || [];
                    
                    if (attachments.length > 0) {
                        messagesWithAttachments++;
                        totalAttachments += attachments.length;
                        console.log(`  📎 Message has ${attachments.length} attachments`);
                        
                        for (const attachment of attachments) {
                            console.log(`    📄 ${attachment.contentName} (${attachment.contentType})`);
                            console.log(`       - attachmentDataRef: ${!!attachment.attachmentDataRef}`);
                            console.log(`       - resourceName: ${attachment.attachmentDataRef?.resourceName || 'NONE'}`);
                            console.log(`       - downloadUri: ${!!attachment.downloadUri}`);
                            console.log(`       - source: ${JSON.stringify(attachment.source)}`);
                            
                            if (attachment.attachmentDataRef?.resourceName) {
                                attachmentsWithResourceName++;
                                
                                // Test actual download
                                console.log(`    🔥 Testing download for: ${attachment.contentName}`);
                                downloadAttempts++;
                                
                                const processed = await mediaProcessingService.processGoogleChatAttachment(
                                    attachment, 
                                    fullMessage.data, 
                                    auth
                                );
                                
                                // Try Chat API download
                                const downloadResult = await mediaProcessingService.downloadFromChatAPI(processed, auth);
                                
                                if (downloadResult) {
                                    successfulDownloads++;
                                    console.log(`    ✅ Successfully downloaded: ${Math.round(downloadResult.fileSize/1024)}KB`);
                                } else {
                                    console.log(`    ❌ Download failed`);
                                }
                            } else {
                                console.log(`    ⚠️ No resourceName - cannot download via Chat API`);
                            }
                        }
                        
                        // Limit to avoid spam
                        if (totalAttachments >= 5) {
                            console.log('\n⏸️ Stopping after 5 attachments to avoid spam...');
                            break;
                        }
                    }
                }
                
                if (totalAttachments >= 5) break;
                
            } catch (error) {
                console.error(`Error checking space ${space.name}:`, error.message);
            }
        }
        
        console.log('\n📊 MEDIA SYNC ANALYSIS:');
        console.log(`- Total messages checked: ${totalMessages}`);
        console.log(`- Messages with attachments: ${messagesWithAttachments}`);
        console.log(`- Total attachments found: ${totalAttachments}`);
        console.log(`- Attachments with resourceName: ${attachmentsWithResourceName}`);
        console.log(`- Download attempts: ${downloadAttempts}`);
        console.log(`- Successful downloads: ${successfulDownloads}`);
        console.log(`- Success rate: ${downloadAttempts > 0 ? Math.round((successfulDownloads/downloadAttempts)*100) : 0}%`);
        
        if (totalAttachments === 0) {
            console.log('\n⚠️ NO ATTACHMENTS FOUND in recent messages');
            console.log('This could explain why no media is being downloaded during sync.');
        } else if (attachmentsWithResourceName === 0) {
            console.log('\n⚠️ NO ATTACHMENTS with resourceName found');
            console.log('Attachments may be Drive files or external links that require different handling.');
        } else if (successfulDownloads === 0) {
            console.log('\n❌ DOWNLOADS FAILING - Debug the download methods');
        } else {
            console.log('\n✅ Downloads working! Check if chat sync is calling the right methods.');
        }
        
        // Check existing chats in database
        const existingChats = await Chat.find({ account: account._id });
        const chatsWithAttachments = existingChats.filter(chat => 
            chat.messages.some(msg => msg.attachments && msg.attachments.length > 0)
        );
        
        console.log(`\n💾 DATABASE STATE:`);
        console.log(`- Total chats in DB: ${existingChats.length}`);
        console.log(`- Chats with attachments: ${chatsWithAttachments.length}`);
        
        if (chatsWithAttachments.length > 0) {
            const totalDbAttachments = chatsWithAttachments.reduce((sum, chat) => 
                sum + chat.messages.reduce((msgSum, msg) => 
                    msgSum + (msg.attachments ? msg.attachments.length : 0), 0), 0
            );
            console.log(`- Total attachments in DB: ${totalDbAttachments}`);
            
            // Check if any have localPath (downloaded)
            let downloadedCount = 0;
            chatsWithAttachments.forEach(chat => {
                chat.messages.forEach(msg => {
                    if (msg.attachments) {
                        msg.attachments.forEach(att => {
                            if (att.localPath) downloadedCount++;
                        });
                    }
                });
            });
            console.log(`- Attachments with localPath: ${downloadedCount}`);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the debug
debugMediaSync();
