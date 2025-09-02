const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

const MONGODB_URI = 'mongodb://localhost:27017/emailscrap';

async function debugParticipantFiltering() {
    console.log('🔍 DEBUGGING PARTICIPANT FILTERING');
    console.log('===================================');
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        console.log(`👤 Current Account: ${account.email}`);
        
        // Get all DM chats
        const chats = await Chat.find({ 
            account: account._id, 
            spaceType: 'DIRECT_MESSAGE'
        }).lean();
        
        console.log(`\n📊 Found ${chats.length} DM chats`);
        
        for (const chat of chats) {
            console.log(`\n🔍 Testing Chat: ${chat.spaceId} - "${chat.displayName}"`);
            console.log(`   Raw participants: ${JSON.stringify(chat.participants, null, 2)}`);
            
            if (chat.participants && chat.participants.length > 0) {
                console.log(`   Participants count: ${chat.participants.length}`);
                
                // Simulate the filtering logic from ChatController
                const nonCurrentUserParticipants = chat.participants.filter(p => 
                    p.email !== account.email && p.email !== `${account.email}`
                );
                
                console.log(`   Non-current-user participants: ${nonCurrentUserParticipants.length}`);
                
                nonCurrentUserParticipants.forEach((p, i) => {
                    console.log(`     ${i+1}. Name: "${p.displayName}" | Email: "${p.email}" | UserId: "${p.userId}"`);
                    
                    // Test the filtering conditions
                    const emailMatches = p.email === account.email;
                    const emailStringMatches = p.email === `${account.email}`;
                    
                    console.log(`        Email matches current user: ${emailMatches}`);
                    console.log(`        Email string matches current user: ${emailStringMatches}`);
                });
                
                if (nonCurrentUserParticipants.length > 0) {
                    const participant = nonCurrentUserParticipants[0];
                    const otherParticipant = {
                        id: participant.userId || `inferred_${participant.email}`,
                        email: participant.email,
                        displayName: participant.displayName,
                        count: 1
                    };
                    
                    console.log(`   ✅ Would create otherParticipant:`, JSON.stringify(otherParticipant, null, 2));
                } else {
                    console.log(`   ❌ Would skip this chat - no non-current-user participants found`);
                }
            } else {
                console.log(`   ❌ Would skip this chat - no participants array`);
            }
        }
        
        console.log(`\n🔍 Let's also check message analysis fallback:`);
        
        for (const chat of chats.slice(0, 2)) { // Just test first 2 chats
            console.log(`\n📨 Message Analysis for: ${chat.displayName}`);
            console.log(`   Messages count: ${chat.messages ? chat.messages.length : 0}`);
            
            if (chat.messages && chat.messages.length > 0) {
                const allSenders = new Map();
                
                for (const m of chat.messages) {
                    if (m.senderId) {
                        if (!allSenders.has(m.senderId)) {
                            allSenders.set(m.senderId, {
                                count: 0,
                                email: m.senderEmail || null,
                                displayName: m.senderDisplayName || null,
                                isSentByCurrentUser: m.isSentByCurrentUser
                            });
                        }
                        allSenders.get(m.senderId).count++;
                    }
                }
                
                console.log(`   Unique senders found: ${allSenders.size}`);
                
                for (const [senderId, info] of allSenders.entries()) {
                    const isCurrentUser = info.email === account.email || info.isSentByCurrentUser;
                    console.log(`     ${senderId}: ${info.email} (${info.displayName}) - CurrentUser: ${isCurrentUser}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

debugParticipantFiltering();
