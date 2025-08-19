const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function storeDirectURLs() {
    try {
        console.log('🔗 Storing direct URLs from attachment data...');
        
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✓ Connected to MongoDB');

        // Find chats with attachments (focus on real chats starting with CMC)
        const allChats = await Chat.find({});
        const realChats = allChats.filter(chat => 
            chat.displayName && 
            chat.displayName.startsWith('CMC') &&
            chat.messages && 
            chat.messages.some(message => 
                message.attachments && message.attachments.length > 0
            )
        );

        console.log(`\n📊 Found ${realChats.length} real CMC chats with attachments`);

        let totalAttachments = 0;
        let urlsStored = 0;
        let alreadyHasUrls = 0;

        for (const chat of realChats) {
            console.log(`\n🏷️  Processing chat: "${chat.displayName}"`);
            
            for (let messageIndex = 0; messageIndex < chat.messages.length; messageIndex++) {
                const message = chat.messages[messageIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    for (let attachmentIndex = 0; attachmentIndex < message.attachments.length; attachmentIndex++) {
                        const attachment = message.attachments[attachmentIndex];
                        totalAttachments++;
                        
                        console.log(`\n📎 Processing: ${attachment.contentName || attachment.name || 'Unknown'}`);
                        
                        // Skip if already has direct URL
                        if (attachment.directMediaUrl) {
                            console.log(`   ✅ Already has directMediaUrl`);
                            alreadyHasUrls++;
                            continue;
                        }
                        
                        let storedUrl = null;
                        
                        // Priority: downloadUrl -> thumbnailUrl
                        if (attachment.downloadUrl && attachment.downloadUrl.includes('chat.google.com')) {
                            storedUrl = attachment.downloadUrl;
                            console.log(`   🔗 Storing downloadUrl as directMediaUrl`);
                        } else if (attachment.thumbnailUrl && attachment.thumbnailUrl.includes('chat.google.com')) {
                            storedUrl = attachment.thumbnailUrl;
                            console.log(`   🖼️  Storing thumbnailUrl as directMediaUrl (thumbnail version)`);
                        }
                        
                        if (storedUrl) {
                            // Store the URL as directMediaUrl
                            message.attachments[attachmentIndex].directMediaUrl = storedUrl;
                            message.attachments[attachmentIndex].directUrlStoredAt = new Date();
                            urlsStored++;
                            console.log(`   ✅ Stored direct URL`);
                        } else {
                            console.log(`   ⚠️  No suitable URL found to store`);
                        }
                    }
                }
            }
            
            // Save updated chat to database
            await chat.save();
            console.log(`💾 Saved chat "${chat.displayName}" to database`);
        }

        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`   📊 Total attachments processed: ${totalAttachments}`);
        console.log(`   🔗 URLs newly stored: ${urlsStored}`);
        console.log(`   ✅ Already had URLs: ${alreadyHasUrls}`);
        console.log(`   📈 Coverage: ${((urlsStored + alreadyHasUrls) / totalAttachments * 100).toFixed(1)}%`);

        if (urlsStored > 0) {
            console.log(`\n🎉 Successfully stored ${urlsStored} direct media URLs!`);
            console.log(`🌐 Your frontend can now use these URLs directly`);
            console.log(`📝 Note: These URLs require the user to be logged into Google Chat`);
            console.log(`🔄 Refresh your frontend to see the changes!`);
        } else if (alreadyHasUrls > 0) {
            console.log(`\n✨ All attachments already had direct URLs stored!`);
        } else {
            console.log(`\n😕 No suitable URLs found to store.`);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from database');
    }
}

// Run the URL storage
storeDirectURLs().catch(console.error);
