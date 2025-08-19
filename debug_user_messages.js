require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
const Chat = require('./db/Chat');

async function debugUserMessages() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🔍 Analyzing User 10850637 messages...\n');
        
        const chats = await Chat.find({});
        let totalMessages = 0;
        let messagesWithText = 0;
        let messagesWithoutText = 0;
        let messagesWithAttachments = 0;
        
        console.log('='.repeat(80));
        console.log('DETAILED MESSAGE ANALYSIS FOR USER 10850637');
        console.log('='.repeat(80));
        
        for (const chat of chats) {
            // Find messages from User 10850637
            const userMessages = chat.messages.filter(msg => 
                msg.senderId && msg.senderId.includes('10850637')
            );
            
            if (userMessages.length > 0) {
                console.log(`\n📂 Chat: ${chat.displayName} (${chat.spaceType})`);
                console.log(`   Space ID: ${chat.spaceId}`);
                console.log(`   User 10850637 messages: ${userMessages.length}`);
                
                totalMessages += userMessages.length;
                
                userMessages.forEach((msg, index) => {
                    const hasText = msg.text && msg.text.trim() !== '';
                    const hasAttachments = msg.attachments && msg.attachments.length > 0;
                    
                    if (hasText) messagesWithText++;
                    else messagesWithoutText++;
                    
                    if (hasAttachments) messagesWithAttachments++;
                    
                    console.log(`\n   Message ${index + 1}:`);
                    console.log(`     ID: ${msg.messageId}`);
                    console.log(`     Text: "${msg.text || '(no text)'}"`);
                    console.log(`     Create Time: ${msg.createTime}`);
                    console.log(`     Sender: ${msg.senderDisplayName}`);
                    console.log(`     Has Text: ${hasText ? 'Yes' : 'No'}`);
                    console.log(`     Attachments: ${hasAttachments ? msg.attachments.length : 0}`);
                    
                    if (hasAttachments) {
                        console.log('     📎 Attachment Details:');
                        msg.attachments.forEach((att, attIndex) => {
                            console.log(`       [${attIndex}] ${att.filename || att.name || 'Unknown'}`);
                            console.log(`           Type: ${att.mimeType || att.contentType || 'Unknown'}`);
                            console.log(`           Media Type: ${att.mediaType || 'Unknown'}`);
                            console.log(`           Local Path: ${att.localPath ? 'Yes' : 'No'}`);
                            console.log(`           Download Status: ${att.downloadStatus || 'Unknown'}`);
                            console.log(`           Size: ${att.fileSize || att.size || 'Unknown'} bytes`);
                        });
                    }
                    
                    // Check if this might be a media message that lost its attachments
                    if (!hasText && !hasAttachments) {
                        console.log(`     ⚠️  SUSPICIOUS: Message with no text AND no attachments!`);
                        console.log(`     ⚠️  This might be a media message that wasn't processed correctly`);
                    }
                });
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY FOR USER 10850637');
        console.log('='.repeat(80));
        console.log(`Total messages: ${totalMessages}`);
        console.log(`Messages with text: ${messagesWithText}`);
        console.log(`Messages without text: ${messagesWithoutText}`);
        console.log(`Messages with attachments: ${messagesWithAttachments}`);
        console.log(`Potential lost media messages: ${messagesWithoutText - messagesWithAttachments}`);
        
        if (messagesWithoutText > messagesWithAttachments) {
            console.log(`\n🚨 ISSUE DETECTED:`);
            console.log(`   ${messagesWithoutText - messagesWithAttachments} messages have no text AND no attachments`);
            console.log(`   These are likely media messages that weren't processed correctly!`);
        }
        
        console.log('\n📋 SPECIFIC MESSAGE IDs TO INVESTIGATE:');
        for (const chat of chats) {
            const suspiciousMessages = chat.messages.filter(msg => 
                msg.senderId && msg.senderId.includes('10850637') &&
                (!msg.text || msg.text.trim() === '') &&
                (!msg.attachments || msg.attachments.length === 0)
            );
            
            if (suspiciousMessages.length > 0) {
                console.log(`\n${chat.displayName}:`);
                suspiciousMessages.slice(0, 5).forEach((msg, i) => {
                    console.log(`  ${i+1}. ${msg.messageId} (${msg.createTime})`);
                });
                if (suspiciousMessages.length > 5) {
                    console.log(`  ... and ${suspiciousMessages.length - 5} more`);
                }
            }
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugUserMessages();
