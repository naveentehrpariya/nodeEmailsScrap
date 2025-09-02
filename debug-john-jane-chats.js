require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function debugJohnJaneChats() {
  try {
    console.log('🔍 DEBUGGING JOHN DOE & JANE SMITH CHATS');
    console.log('=========================================');
    
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    // Get the specific chats we're interested in
    const johnDoeChats = await Chat.find({
      account: account._id,
      spaceType: 'DIRECT_MESSAGE',
      $or: [
        { displayName: /john.*doe/i },
        { 'participants.email': 'john.doe@crossmilescarrier.com' },
        { spaceId: 'spaces/ilSNZCAAAAE' },
        { spaceId: 'spaces/w9y_pCAAAAE' }
      ]
    }).lean();
    
    const janeSmithChats = await Chat.find({
      account: account._id,
      spaceType: 'DIRECT_MESSAGE',
      $or: [
        { displayName: /jane.*smith/i },
        { 'participants.email': 'jane.smith@crossmilescarrier.com' },
        { spaceId: 'spaces/oSpG6CAAAAE' }
      ]
    }).lean();
    
    console.log(`\n📊 John Doe chats found: ${johnDoeChats.length}`);
    console.log(`📊 Jane Smith chats found: ${janeSmithChats.length}`);
    
    const targetChats = [...johnDoeChats, ...janeSmithChats];
    
    console.log(`\n🔍 DETAILED ANALYSIS OF TARGET CHATS`);
    console.log(`====================================`);
    
    for (const chat of targetChats) {
        console.log(`\n📋 Chat: ${chat.spaceId} - "${chat.displayName}"`);
        console.log(`   Space Type: ${chat.spaceType}`);
        console.log(`   Message Count: ${chat.messageCount || 0}`);
        console.log(`   Messages: ${chat.messages ? chat.messages.length : 0}`);
        console.log(`   Participants: ${chat.participants ? chat.participants.length : 0}`);
        
        if (chat.participants && chat.participants.length > 0) {
            chat.participants.forEach((p, i) => {
                console.log(`     ${i+1}. ${p.displayName} (${p.email}) - ${p.userId}`);
            });
            
            // Simulate the exact filtering logic from ChatController
            const nonCurrentUserParticipants = chat.participants.filter(p => 
                p.email !== account.email && p.email !== `${account.email}`
            );
            
            console.log(`   Non-current-user participants: ${nonCurrentUserParticipants.length}`);
            
            if (nonCurrentUserParticipants.length > 0) {
                const participant = nonCurrentUserParticipants[0];
                console.log(`   ✅ Should show as: "${participant.displayName}"`);
                
                // Check what filtering conditions would apply
                const hasResolvedName = false; // We don't have Google Directory resolution
                const hasProperEmail = participant.email && 
                    participant.email.includes('@') && 
                    !participant.email.includes('user-') && 
                    !participant.email.endsWith('@unknown');
                const hasStoredDisplayName = participant.displayName && 
                    !participant.displayName.startsWith('User ') &&
                    !participant.displayName.startsWith('Unknown');
                
                console.log(`   Email check: ${hasProperEmail ? '✅ PASS' : '❌ FAIL'} (${participant.email})`);
                console.log(`   Display name check: ${hasStoredDisplayName ? '✅ PASS' : '❌ FAIL'} (${participant.displayName})`);
                
                let shouldShow = true;
                let showReason = 'default';
                
                if (hasProperEmail) {
                    shouldShow = true;
                    showReason = 'proper_email';
                } else if (hasStoredDisplayName) {
                    shouldShow = true;
                    showReason = 'stored_display_name';
                } else if (participant.email) {
                    shouldShow = true;
                    showReason = 'email_fallback';
                } else {
                    shouldShow = false;
                    showReason = 'no_participant_info';
                }
                
                console.log(`   Final decision: ${shouldShow ? '✅ SHOW' : '❌ SKIP'} (reason: ${showReason})`);
                
            } else {
                console.log(`   ❌ Would be SKIPPED - no non-current-user participants`);
            }
        } else {
            console.log(`   ❌ Would be SKIPPED - no participants array`);
        }
        
        // Check messages for fallback analysis
        if (chat.messages && chat.messages.length > 0) {
            console.log(`   Message fallback analysis:`);
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
            
            console.log(`     Unique senders: ${allSenders.size}`);
            for (const [senderId, info] of allSenders.entries()) {
                const isCurrentUser = info.email === account.email || info.isSentByCurrentUser;
                console.log(`       ${senderId}: ${info.email} (${info.displayName}) - Current: ${isCurrentUser}`);
            }
        }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

debugJohnJaneChats();
