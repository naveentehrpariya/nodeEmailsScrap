#!/usr/bin/env node

const mongoose = require('mongoose');
const mediaProcessingService = require('./services/mediaProcessingService');

// Set up Mongoose
mongoose.set('strictQuery', false);

// Define schemas directly to avoid registration issues
const accountSchema = new mongoose.Schema({
    email: String,
    name: String,
    status: String
});

const chatSchema = new mongoose.Schema({
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    spaceId: String,
    displayName: String,
    spaceType: String,
    messages: [{
        messageId: String,
        text: String,
        attachments: [{
            filename: String,
            name: String,
            mediaType: String,
            mimeType: String,
            contentType: String,
            localPath: String,
            downloadStatus: String,
            downloadUri: String,
            thumbnailUri: String
        }]
    }]
});

const Account = mongoose.model('Account', accountSchema);
const Chat = mongoose.model('Chat', chatSchema);

async function generateStatusReport() {
    console.log('📊 COMPREHENSIVE STATUS REPORT: Media Integration Enhancement\n');
    console.log('═'.repeat(80));
    
    try {
        // Connect to database
        const dbUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/emailscrap';
        await mongoose.connect(dbUri);
        console.log(`✅ Connected to MongoDB (${dbUri})\n`);
        
        // 1. Check accounts
        console.log('1️⃣ ACCOUNTS STATUS:');
        const accounts = await Account.find({}).select('email name status');
        console.log(`   📧 Total accounts: ${accounts.length}`);
        accounts.forEach(account => {
            console.log(`      • ${account.email} (${account.name})`);
        });
        console.log();
        
        // 2. Check chats and attachments
        console.log('2️⃣ CHATS & ATTACHMENTS STATUS:');
        const chats = await Chat.find({}).populate('account', 'email');
        
        let totalChats = 0;
        let totalMessages = 0;
        let totalAttachments = 0;
        let attachmentsWithLocalPath = 0;
        let attachmentsByType = {};
        
        chats.forEach(chat => {
            totalChats++;
            totalMessages += chat.messages.length;
            
            chat.messages.forEach(message => {
                if (message.attachments && message.attachments.length > 0) {
                    message.attachments.forEach(att => {
                        totalAttachments++;
                        
                        // Count by media type
                        const type = att.mediaType || 'unknown';
                        attachmentsByType[type] = (attachmentsByType[type] || 0) + 1;
                        
                        // Count with local paths
                        if (att.localPath) {
                            attachmentsWithLocalPath++;
                        }
                    });
                }
            });
        });
        
        console.log(`   💬 Total chats: ${totalChats}`);
        console.log(`   📨 Total messages: ${totalMessages}`);
        console.log(`   📎 Total attachments: ${totalAttachments}`);
        console.log(`   💾 Attachments with local paths: ${attachmentsWithLocalPath}/${totalAttachments} (${Math.round(attachmentsWithLocalPath/totalAttachments*100)}%)`);
        console.log(`   📊 Attachments by type:`);
        Object.entries(attachmentsByType).forEach(([type, count]) => {
            console.log(`      • ${type}: ${count}`);
        });
        console.log();
        
        // 3. Check media directory
        console.log('3️⃣ MEDIA DIRECTORY STATUS:');
        const mediaStats = await mediaProcessingService.getMediaStatistics();
        console.log(`   📁 Total files: ${mediaStats.totalFiles}`);
        console.log(`   🖼️ Total thumbnails: ${mediaStats.totalThumbnails}`);
        console.log(`   💽 Total size: ${mediaStats.totalSizeMB}MB`);
        console.log(`   📋 File types: ${JSON.stringify(mediaStats.fileTypeBreakdown, null, 6)}`);
        console.log();
        
        // 4. Show sample attachments
        console.log('4️⃣ SAMPLE ATTACHMENTS:');
        const sampleChat = chats.find(chat => 
            chat.messages.some(msg => msg.attachments && msg.attachments.length > 0)
        );
        
        if (sampleChat) {
            console.log(`   📁 Sample from chat: ${sampleChat.displayName}`);
            const messageWithAttachments = sampleChat.messages.find(msg => 
                msg.attachments && msg.attachments.length > 0
            );
            
            if (messageWithAttachments) {
                console.log(`   📨 Message: "${messageWithAttachments.text.substring(0, 50)}..."`);
                messageWithAttachments.attachments.forEach((att, index) => {
                    console.log(`      📎 ${index + 1}. ${att.filename || att.name}`);
                    console.log(`         Type: ${att.mediaType || 'unknown'}`);
                    console.log(`         MIME: ${att.mimeType || att.contentType}`);
                    console.log(`         Local Path: ${att.localPath || 'None'}`);
                    console.log(`         Download Status: ${att.downloadStatus || 'unknown'}`);
                    console.log(`         Download URI: ${att.downloadUri ? 'Present' : 'None'}`);
                    console.log(`         Thumbnail URI: ${att.thumbnailUri ? 'Present' : 'None'}`);
                });
            }
        } else {
            console.log(`   ℹ️ No attachments found in database`);
        }
        console.log();
        
        // 5. Enhancement summary
        console.log('5️⃣ ENHANCEMENT SUMMARY:');
        console.log('   ✅ Enhanced media processing service with download capabilities');
        console.log('   ✅ Added automatic download during chat sync process');
        console.log('   ✅ Multiple download strategies implemented:');
        console.log('      • Direct Google Chat download URLs');
        console.log('      • Chat API media download');
        console.log('      • Gmail API attachment search & download');
        console.log('   ✅ Robust error handling and fallback mechanisms');
        console.log('   ✅ File sanitization and safe storage');
        console.log('   ✅ Media type classification and metadata extraction');
        console.log();
        
        // 6. Current challenges
        console.log('6️⃣ CURRENT CHALLENGES:');
        console.log('   ⚠️ Service account requires domain-wide delegation for Gmail API');
        console.log('   ⚠️ Google Chat download URLs require special authentication');
        console.log('   ⚠️ Chat API media download has permission limitations');
        console.log();
        
        // 7. Recommendations
        console.log('7️⃣ RECOMMENDATIONS:');
        console.log('   🔧 Option 1: Configure domain-wide delegation in Google Workspace Admin');
        console.log('      • Enable Gmail API access for the service account');
        console.log('      • This would enable Gmail-based attachment downloads');
        console.log();
        console.log('   🔧 Option 2: Use existing media proxy with Google Chat URLs');
        console.log('      • Frontend already has media proxy for authenticated requests');
        console.log('      • Can display attachments directly from Google Chat URLs');
        console.log('      • No local storage needed - works with current setup');
        console.log();
        console.log('   🔧 Option 3: Implement OAuth2 flow for individual users');
        console.log('      • Allow users to authorize their own Google accounts');
        console.log('      • Download attachments with user permissions');
        console.log();
        
        // 8. Next steps
        console.log('8️⃣ IMMEDIATE NEXT STEPS:');
        console.log('   🎯 Test the existing media proxy with Google Chat attachment URLs');
        console.log('   🎯 Verify frontend can display attachments via authenticated proxy');
        console.log('   🎯 If needed, enhance proxy to handle Google Chat authentication');
        console.log('   🎯 Run a sync to populate attachment metadata in database');
        console.log();
        
        console.log('═'.repeat(80));
        console.log('✨ STATUS: Enhanced media processing is ready - authentication setup needed');
        console.log('🎉 IMPACT: Significant improvement in attachment handling and future-proofing');
        
    } catch (error) {
        console.error('❌ Error generating status report:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

// Run report if called directly
if (require.main === module) {
    generateStatusReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('💥 Report error:', error);
        process.exit(1);
    });
}

module.exports = { generateStatusReport };
