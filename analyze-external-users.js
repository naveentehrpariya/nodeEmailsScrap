require('dotenv').config();
const { MongoClient } = require('mongodb');

async function analyzeExternalUsers() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🔍 Analyzing external users by their actual messages...');
        
        // Get the chats with external users who actually sent messages
        const activeExternalUsers = [
            'users/115048080534626721571', // 5 messages
            'users/104329836262309309664', // 9 messages  
            'users/103074035611191657205'  // 1 message
        ];
        
        for (const userId of activeExternalUsers) {
            console.log(`\n🔍 Analyzing ${userId}:`);
            
            // Find chats where this user sent messages
            const chats = await db.collection('chats').find({
                'messages.senderId': userId
            }).toArray();
            
            for (const chat of chats) {
                const userMessages = chat.messages.filter(m => m.senderId === userId);
                
                console.log(`  Chat: ${chat.spaceId}`);
                console.log(`  Messages from this user: ${userMessages.length}`);
                
                // Show actual message content to understand who this person might be
                console.log(`  Message samples:`);
                userMessages.slice(0, 3).forEach((msg, i) => {
                    let text = msg.text || '(no text)';
                    if (text.length > 100) {
                        text = text.substring(0, 100) + '...';
                    }
                    console.log(`    ${i + 1}. "${text}"`);
                    console.log(`       Sender display name: ${msg.senderDisplayName}`);
                    console.log(`       Sender email: ${msg.senderEmail}`);
                    console.log(`       Time: ${new Date(msg.createTime).toLocaleString()}`);
                });
                
                // Look for patterns that might indicate who this person is
                const allText = userMessages.map(m => m.text || '').join(' ').toLowerCase();
                
                // Check for name mentions
                const namePatterns = [
                    /my name is ([a-z]+)/gi,
                    /i'm ([a-z]+)/gi, 
                    /this is ([a-z]+)/gi,
                    /call me ([a-z]+)/gi,
                    /([a-z]+) here/gi
                ];
                
                namePatterns.forEach(pattern => {
                    const matches = [...allText.matchAll(pattern)];
                    if (matches.length > 0) {
                        console.log(`  🎯 Found name clues: ${matches.map(m => m[1]).join(', ')}`);
                    }
                });
                
                // Check for role/position mentions
                const rolePatterns = [
                    /dispatch/gi,
                    /driver/gi,
                    /manager/gi,
                    /admin/gi,
                    /support/gi,
                    /office/gi
                ];
                
                rolePatterns.forEach(pattern => {
                    if (pattern.test(allText)) {
                        console.log(`  🏢 Found role indicator: ${pattern.source}`);
                    }
                });
                
                // Show conversation context
                console.log(`  📝 Conversation context:`);
                const allMessages = chat.messages.sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
                allMessages.slice(0, 5).forEach(msg => {
                    const sender = msg.isSentByCurrentUser ? 'You' : (msg.senderDisplayName || 'Other');
                    const text = (msg.text || '').substring(0, 50);
                    console.log(`    ${sender}: ${text}${text.length === 50 ? '...' : ''}`);
                });
            }
        }
        
        console.log('\n💡 Based on the message analysis, you can now:');
        console.log('1. Look at the message content to identify who each person really is');
        console.log('2. Check if the message style/content matches any known employees');
        console.log('3. Manually specify the correct mapping if you recognize the person');
        console.log('\\nIf you can tell me who these users actually are based on the message content,');
        console.log('I can update the mappings correctly.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

analyzeExternalUsers();
