const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
require('dotenv').config();

async function debugDirectMessages() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/EmailScrap');
        console.log('✅ Connected to MongoDB');
        
        // Get naveendev account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }
        
        console.log(`🔍 Analyzing direct message chats for: ${account.email}\\n`);
        
        // Get direct message chats
        const directChats = await Chat.find({ 
            account: account._id, 
            spaceType: 'DIRECT_MESSAGE' 
        }).sort({ lastMessageTime: -1 }).lean();
        
        console.log(`📊 Found ${directChats.length} direct message chats\\n`);
        
        for (let i = 0; i < directChats.length; i++) {
            const chat = directChats[i];
            console.log(`=== CHAT ${i + 1}: ${chat.displayName} ===`);
            console.log(`Space ID: ${chat.spaceId}`);
            console.log(`Messages: ${chat.messages?.length || 0}`);
            console.log(`Participants: ${chat.participants?.length || 0}`);
            
            // Show participants details
            if (chat.participants && chat.participants.length > 0) {
                console.log('\\n📋 PARTICIPANTS:');
                chat.participants.forEach((p, index) => {
                    console.log(`  ${index + 1}. User ID: ${p.userId || 'N/A'}`);
                    console.log(`     Display Name: "${p.displayName || 'N/A'}"`);
                    console.log(`     Email: ${p.email || 'N/A'}`);
                    console.log(`     Domain: ${p.domain || 'N/A'}`);
                });
            } else {
                console.log('\\n❌ NO PARTICIPANTS DATA');
            }
            
            // Analyze messages for senders
            if (chat.messages && chat.messages.length > 0) {
                console.log('\\n💬 MESSAGE SENDERS:');
                const uniqueSenders = new Map();
                
                chat.messages.forEach(msg => {
                    if (msg.senderId && !uniqueSenders.has(msg.senderId)) {
                        uniqueSenders.set(msg.senderId, {
                            senderId: msg.senderId,
                            senderDisplayName: msg.senderDisplayName,
                            senderEmail: msg.senderEmail,
                            isSentByCurrentUser: msg.isSentByCurrentUser
                        });
                    }
                });
                
                Array.from(uniqueSenders.values()).forEach((sender, index) => {
                    console.log(`  ${index + 1}. Sender ID: ${sender.senderId}`);
                    console.log(`     Display Name: "${sender.senderDisplayName || 'N/A'}"`);
                    console.log(`     Email: ${sender.senderEmail || 'N/A'}`);
                    console.log(`     Is Current User: ${sender.isSentByCurrentUser}`);
                });
            } else {
                console.log('\\n❌ NO MESSAGES');
            }
            
            // Apply the same logic as the controller to see what name would be chosen
            console.log('\\n🎯 NAME RESOLUTION SIMULATION:');
            
            let resolvedTitle = 'Unknown';
            let foundOtherParticipant = false;
            
            // Strategy 1: Check participants
            if (chat.participants && chat.participants.length > 1) {
                const otherParticipants = chat.participants.filter(p => 
                    p.email !== account.email
                );
                
                if (otherParticipants.length > 0) {
                    const otherParticipant = otherParticipants[0];
                    resolvedTitle = otherParticipant.displayName || otherParticipant.email?.split('@')[0] || 'Unknown User';
                    foundOtherParticipant = true;
                    console.log(`   ✅ Strategy 1 SUCCESS: Found other participant -> "${resolvedTitle}"`);
                } else {
                    console.log(`   ❌ Strategy 1 FAILED: No other participants found`);
                }
            } else {
                console.log(`   ❌ Strategy 1 FAILED: Less than 2 participants (${chat.participants?.length || 0})`);
            }
            
            // Strategy 2: Check messages
            if (!foundOtherParticipant && chat.messages && chat.messages.length > 0) {
                const otherSenders = chat.messages.filter(m => 
                    !m.isSentByCurrentUser && 
                    m.senderEmail !== account.email &&
                    m.senderEmail && 
                    m.senderEmail.trim() !== ''
                );
                
                if (otherSenders.length > 0) {
                    const otherSender = otherSenders[0];
                    
                    if (otherSender.senderDisplayName && 
                        !otherSender.senderDisplayName.startsWith('User ') &&
                        !otherSender.senderDisplayName.startsWith('user-')) {
                        resolvedTitle = otherSender.senderDisplayName;
                    } else if (otherSender.senderEmail && 
                              !otherSender.senderEmail.includes('user-') &&
                              otherSender.senderEmail.includes('@')) {
                        resolvedTitle = otherSender.senderEmail.split('@')[0];
                    } else {
                        resolvedTitle = otherSender.senderDisplayName || 'Unknown User';
                    }
                    
                    foundOtherParticipant = true;
                    console.log(`   ✅ Strategy 2 SUCCESS: Found other sender -> "${resolvedTitle}"`);
                } else {
                    console.log(`   ❌ Strategy 2 FAILED: No other message senders found`);
                }
            } else {
                console.log(`   ❌ Strategy 2 SKIPPED: Already found participant or no messages`);
            }
            
            // Strategy 3: Fallbacks
            if (!foundOtherParticipant) {
                if (chat.participants && chat.participants.length === 1) {
                    resolvedTitle = chat.displayName && chat.displayName !== '(Direct Message)' ? chat.displayName : 'My Notes';
                    console.log(`   ✅ Strategy 3 SUCCESS: One-way chat -> "${resolvedTitle}"`);
                } else {
                    resolvedTitle = chat.displayName && chat.displayName !== '(Direct Message)' ? chat.displayName : 'Unknown Chat';
                    console.log(`   ✅ Strategy 3 SUCCESS: Generic fallback -> "${resolvedTitle}"`);
                }
            }
            
            console.log(`\\n🏷️  FINAL RESOLVED TITLE: "${resolvedTitle}"\\n`);
            console.log('='.repeat(50) + '\\n');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    }
}

debugDirectMessages();
