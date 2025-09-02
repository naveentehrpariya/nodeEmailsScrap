const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
require('dotenv').config();

async function analyzeUnknownContact() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/EmailScrap');
        console.log('✅ Connected to MongoDB');
        
        // Find the chat with the unknown contact
        const chat = await Chat.findOne({ spaceId: 'spaces/zJfRaCAAAAE' }).lean();
        
        if (!chat) {
            console.log('❌ Chat not found');
            return;
        }
        
        console.log('🔍 ANALYZING UNKNOWN CONTACT CHAT');
        console.log(`Space ID: ${chat.spaceId}`);
        console.log(`Messages: ${chat.messages?.length || 0}`);
        console.log('\\nParticipants:');
        chat.participants.forEach(p => {
            console.log(`  - ${p.displayName} (${p.email}) [${p.userId}]`);
        });
        
        console.log('\\n💬 RECENT MESSAGES:');
        const recentMessages = chat.messages.slice(-10); // Last 10 messages
        
        recentMessages.forEach((msg, index) => {
            console.log(`\\n${index + 1}. ${new Date(msg.createTime).toLocaleDateString()}`);
            console.log(`   From: ${msg.senderDisplayName} (${msg.senderEmail})`);
            console.log(`   Text: ${msg.text?.substring(0, 100) || '(no text)'}...`);
            console.log(`   Is Current User: ${msg.isSentByCurrentUser}`);
            console.log(`   Sender ID: ${msg.senderId}`);
        });
        
        // Check if there are any clues in the message content about who this is
        console.log('\\n🕵️ LOOKING FOR CLUES IN MESSAGE CONTENT:');
        const otherUserMessages = chat.messages.filter(m => 
            !m.isSentByCurrentUser && m.senderId === 'users/115048080534626721571'
        );
        
        console.log(`Found ${otherUserMessages.length} messages from the unknown user:`);
        otherUserMessages.forEach((msg, index) => {
            if (msg.text && msg.text.trim()) {
                console.log(`  ${index + 1}. "${msg.text}"`);
            }
        });
        
        // Also check your messages TO this person for context
        console.log('\\n📤 YOUR MESSAGES TO THIS PERSON:');
        const yourMessages = chat.messages.filter(m => m.isSentByCurrentUser);
        yourMessages.slice(-5).forEach((msg, index) => {
            if (msg.text && msg.text.trim()) {
                console.log(`  ${index + 1}. "${msg.text}"`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

analyzeUnknownContact();
