require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
const Chat = require('./db/Chat');

async function cleanupDummyMessages() {
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('🧹 Cleaning up dummy/sample messages...');
        
        const chats = await Chat.find({});
        let totalRemoved = 0;
        
        for (const chat of chats) {
            const originalCount = chat.messages.length;
            
            // Remove messages with sample/test/dummy IDs
            chat.messages = chat.messages.filter(msg => 
                !msg.messageId.includes('sample-msg') && 
                !msg.messageId.includes('test-msg') &&
                msg.senderDisplayName !== 'Test User' &&
                msg.senderDisplayName !== 'Another User'
            );
            
            const newCount = chat.messages.length;
            const removedCount = originalCount - newCount;
            
            if (removedCount > 0) {
                console.log(`  ${chat.displayName}: Removed ${removedCount} dummy messages`);
                await chat.save();
                totalRemoved += removedCount;
            }
        }
        
        console.log(`✅ Cleanup complete! Removed ${totalRemoved} dummy messages total.`);
        
        // Now analyze remaining real messages for potential media
        console.log('\n🔍 Analyzing real messages for potential media content...');
        
        for (const chat of chats) {
            const messagesWithNoText = chat.messages.filter(msg => 
                !msg.text || msg.text.trim() === '' || msg.text === '(no text)'
            );
            
            if (messagesWithNoText.length > 0) {
                console.log(`\n📂 ${chat.displayName} (${chat.spaceType}):`);
                console.log(`   Messages with no text: ${messagesWithNoText.length}`);
                
                messagesWithNoText.slice(0, 3).forEach((msg, i) => {
                    console.log(`   ${i+1}. ${msg.messageId}`);
                    console.log(`      Sender: ${msg.senderDisplayName}`);
                    console.log(`      Create Time: ${msg.createTime}`);
                    console.log(`      Has attachments: ${msg.attachments && msg.attachments.length > 0 ? 'Yes' : 'No'}`);
                });
                
                if (messagesWithNoText.length > 3) {
                    console.log(`   ... and ${messagesWithNoText.length - 3} more`);
                }
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

cleanupDummyMessages();
