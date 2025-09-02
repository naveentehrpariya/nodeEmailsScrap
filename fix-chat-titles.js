require('dotenv').config();
const Chat = require('./db/Chat');
const connectDB = require('./db/config');

async function fixChatTitles() {
    try {
        await connectDB();
        console.log('🔧 Fixing chat titles for direct messages...\n');
        
        // Find all direct message chats with undefined or generic titles
        const chatsToFix = await Chat.find({
            accountEmail: 'naveendev@crossmilescarrier.com',
            spaceType: 'DIRECT_MESSAGE',
            $or: [
                { title: { $exists: false } },
                { title: null },
                { title: '' },
                { title: 'undefined' },
                { displayName: '(Direct Message)' }
            ]
        });
        
        console.log(`Found ${chatsToFix.length} chats that need title fixes\n`);
        
        let fixedCount = 0;
        
        for (const chat of chatsToFix) {
            let newTitle = 'Unknown Chat';
            
            // Get participants excluding the current user
            const otherParticipants = chat.participants.filter(p => 
                p.email !== 'naveendev@crossmilescarrier.com'
            );
            
            if (otherParticipants.length > 0) {
                // Use the display name of the first other participant
                const otherParticipant = otherParticipants[0];
                newTitle = otherParticipant.displayName || 
                          (otherParticipant.email ? otherParticipant.email.split('@')[0] : 'Unknown User');
            } else if (chat.participants.length === 1) {
                // Only current user - it's a "My Notes" chat
                newTitle = 'My Notes';
            }
            
            // Update the chat title
            await Chat.findByIdAndUpdate(chat._id, {
                title: newTitle,
                displayName: newTitle !== 'My Notes' ? newTitle : '(Direct Message)'
            });
            
            console.log(`✅ Fixed chat ${chat._id.toString().substring(0, 8)}... : "${newTitle}"`);
            console.log(`   Participants: ${chat.participants.map(p => p.displayName).join(', ')}\n`);
            
            fixedCount++;
        }
        
        console.log(`\n🎉 Successfully fixed ${fixedCount} chat titles!`);
        
        // Verify the fixes
        console.log('\n📋 Verification - checking updated titles:');
        const updatedChats = await Chat.find({
            accountEmail: 'naveendev@crossmilescarrier.com',
            spaceType: 'DIRECT_MESSAGE'
        }).select('title displayName participants').limit(10);
        
        updatedChats.forEach(chat => {
            const participantNames = chat.participants.map(p => p.displayName).join(', ');
            console.log(`  ${chat.title} (participants: ${participantNames})`);
        });
        
    } catch (error) {
        console.error('❌ Error fixing chat titles:', error);
    }
    
    process.exit(0);
}

fixChatTitles();
