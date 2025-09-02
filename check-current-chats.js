require('dotenv').config();
const axios = require('axios');

async function checkCurrentChats() {
    try {
        console.log('🔍 Fetching current chat list from API...');
        
        const response = await axios.get('http://localhost:8080/test/account/naveendev@crossmilescarrier.com/chats');
        
        const chats = response.data.data.chats;
        console.log(`\n📊 Found ${chats.length} chats:\n`);
        
        chats.forEach((chat, index) => {
            const icon = chat.isGroup ? '👥' : '💬';
            const participants = chat.participants ? ` (${chat.participants.join(', ')})` : '';
            console.log(`${index + 1}. ${icon} ${chat.title}${participants}`);
            
            if (chat.title === 'Chat Recipient') {
                console.log(`   ⚠️  This chat shows "Chat Recipient" - needs proper name resolution`);
            }
        });
        
        // Count Chat Recipients
        const chatRecipientCount = chats.filter(chat => chat.title === 'Chat Recipient').length;
        const userIdCount = chats.filter(chat => chat.title.startsWith('user-')).length;
        console.log(`\n📈 Summary:`);
        console.log(`   Total chats: ${chats.length}`);
        console.log(`   "Chat Recipient" chats: ${chatRecipientCount}`);
        console.log(`   User ID chats: ${userIdCount}`);
        
        if (chatRecipientCount > 0) {
            console.log(`\n🔧 Found ${chatRecipientCount} chats showing "Chat Recipient" - these need proper name resolution.`);
        }
        if (userIdCount > 0) {
            console.log(`🔧 Found ${userIdCount} chats showing user IDs instead of names - these also need better name resolution.`);
        }
        
    } catch (error) {
        console.error('❌ Error fetching chats:', error.message);
    }
}

checkCurrentChats();
