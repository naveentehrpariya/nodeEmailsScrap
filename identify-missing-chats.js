const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function identifyMissingChats() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails');
    console.log('✅ Connected to MongoDB Atlas');
    
    console.log('\n🔍 IDENTIFYING NARENDER AND DISPATCH CHATS IN NAVEENDEV ACCOUNT:');
    console.log('='.repeat(70));
    
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const narenderAccount = await Account.findOne({ email: 'narender@crossmilescarrier.com' });
    const dispatchAccount = await Account.findOne({ email: 'dispatch@crossmilescarrier.com' });
    
    if (!naveendevAccount) {
      console.log('❌ Naveendev account not found');
      return;
    }
    
    // Get the specific space IDs that contain chats with narender and dispatch
    const narenderSpaceId = 'spaces/ilSNZCAAAAE'; // From previous output
    const dispatchSpaceId = 'spaces/w9y_pCAAAAE';  // From previous output
    
    console.log('\n📝 FINDING THESE CHATS IN NAVEENDEV ACCOUNT:');
    
    const naveendevChats = await Chat.find({ account: naveendevAccount._id }).lean();
    
    // Find the narender chat
    const narenderChat = naveendevChats.find(chat => chat.spaceId === narenderSpaceId);
    if (narenderChat) {
      console.log('\n🎯 NARENDER CHAT FOUND IN NAVEENDEV ACCOUNT:');
      console.log(`   Display Name: "${narenderChat.displayName}"`);
      console.log(`   Space ID: ${narenderChat.spaceId}`);
      console.log(`   Space Type: ${narenderChat.spaceType}`);
      console.log(`   Messages: ${narenderChat.messages.length}`);
      
      // Show participants
      const participants = new Map();
      narenderChat.messages.forEach(msg => {
        if (msg.senderEmail) {
          participants.set(msg.senderEmail, {
            name: msg.senderDisplayName,
            count: (participants.get(msg.senderEmail)?.count || 0) + 1
          });
        }
      });
      
      console.log(`   👥 Participants:`);
      for (const [email, info] of participants.entries()) {
        console.log(`      - ${info.name || 'Unknown'} (${email}) - ${info.count} messages`);
      }
      
      // Show recent messages
      const recentMessages = narenderChat.messages.slice(-3);
      console.log(`   💬 Recent messages:`);
      recentMessages.forEach(msg => {
        console.log(`      "${msg.text}" - ${msg.senderDisplayName || 'Unknown'}`);
      });
    } else {
      console.log('\n❌ NARENDER CHAT NOT FOUND IN NAVEENDEV ACCOUNT');
    }
    
    // Find the dispatch chat
    const dispatchChat = naveendevChats.find(chat => chat.spaceId === dispatchSpaceId);
    if (dispatchChat) {
      console.log('\n🎯 DISPATCH CHAT FOUND IN NAVEENDEV ACCOUNT:');
      console.log(`   Display Name: "${dispatchChat.displayName}"`);
      console.log(`   Space ID: ${dispatchChat.spaceId}`);
      console.log(`   Space Type: ${dispatchChat.spaceType}`);
      console.log(`   Messages: ${dispatchChat.messages.length}`);
      
      // Show participants
      const participants = new Map();
      dispatchChat.messages.forEach(msg => {
        if (msg.senderEmail) {
          participants.set(msg.senderEmail, {
            name: msg.senderDisplayName,
            count: (participants.get(msg.senderEmail)?.count || 0) + 1
          });
        }
      });
      
      console.log(`   👥 Participants:`);
      for (const [email, info] of participants.entries()) {
        console.log(`      - ${info.name || 'Unknown'} (${email}) - ${info.count} messages`);
      }
      
      // Show recent messages
      const recentMessages = dispatchChat.messages.slice(-3);
      console.log(`   💬 Recent messages:`);
      recentMessages.forEach(msg => {
        console.log(`      "${msg.text}" - ${msg.senderDisplayName || 'Unknown'}`);
      });
    } else {
      console.log('\n❌ DISPATCH CHAT NOT FOUND IN NAVEENDEV ACCOUNT');
    }
    
    // Check why these chats might not be appearing in the API
    console.log('\n🔍 ANALYZING WHY THESE CHATS MIGHT NOT APPEAR IN API:');
    console.log('='.repeat(60));
    
    if (narenderChat || dispatchChat) {
      console.log('The chats exist in the database but may be filtered out by:');
      console.log('1. 📋 Display Name filtering (showing as generic names)');
      console.log('2. 🔄 Deduplication logic');
      console.log('3. 👥 Participant resolution issues');
      console.log('4. 🚫 Filtering criteria in getAccountChats method');
      
      // Simulate the API filtering logic
      console.log('\n🔍 SIMULATING API FILTERING LOGIC:');
      
      const chatsToTest = [];
      if (narenderChat) chatsToTest.push({ name: 'Narender', chat: narenderChat });
      if (dispatchChat) chatsToTest.push({ name: 'Dispatch', chat: dispatchChat });
      
      for (const { name, chat } of chatsToTest) {
        console.log(`\n📝 Testing ${name} chat filtering:`);
        
        if (chat.spaceType === 'DIRECT_MESSAGE') {
          // Find the other participant
          const allSenders = new Map();
          
          for (const m of chat.messages) {
            if (m.senderId) {
              if (!allSenders.has(m.senderId)) {
                allSenders.set(m.senderId, {
                  email: m.senderEmail || null,
                  displayName: m.senderDisplayName || null,
                  isSentByCurrentUser: m.isSentByCurrentUser,
                  count: 0
                });
              }
              allSenders.get(m.senderId).count++;
            }
          }
          
          // Find other participant
          let otherParticipant = null;
          for (const [senderId, info] of allSenders.entries()) {
            const isCurrentUser = info.email === 'naveendev@crossmilescarrier.com' || info.isSentByCurrentUser;
            if (!isCurrentUser) {
              if (!otherParticipant || info.count > otherParticipant.count) {
                otherParticipant = { id: senderId, ...info };
              }
            }
          }
          
          if (otherParticipant) {
            console.log(`   👥 Other participant: ${otherParticipant.displayName} (${otherParticipant.email})`);
            
            // Check filtering criteria
            const hasResolvedName = false; // No Google API resolution in this test
            const hasProperEmail = otherParticipant.email && 
              otherParticipant.email.includes('@') && 
              !otherParticipant.email.includes('user-') && 
              !otherParticipant.email.endsWith('@unknown');
            const hasStoredDisplayName = otherParticipant.displayName && 
              !otherParticipant.displayName.startsWith('User ') &&
              !otherParticipant.displayName.startsWith('Unknown');
            
            let shouldShow = true;
            let showReason = 'default';
            
            if (hasResolvedName) {
              shouldShow = true;
              showReason = 'resolved_name';
            } else if (hasProperEmail) {
              shouldShow = true;
              showReason = 'proper_email';
            } else if (hasStoredDisplayName) {
              shouldShow = true;
              showReason = 'stored_display_name';
            } else if (otherParticipant.email) {
              shouldShow = true;
              showReason = 'email_fallback';
            } else if (otherParticipant.id) {
              shouldShow = true;
              showReason = 'id_fallback';
            } else {
              shouldShow = false;
              showReason = 'no_participant_info';
            }
            
            console.log(`   ✨ Filtering result:`);
            console.log(`      - hasProperEmail: ${hasProperEmail}`);
            console.log(`      - hasStoredDisplayName: ${hasStoredDisplayName}`);
            console.log(`      - shouldShow: ${shouldShow} (reason: ${showReason})`);
            
            if (shouldShow) {
              // Check what title would be displayed
              let chatTitle = otherParticipant.displayName;
              if (!chatTitle && otherParticipant.email) {
                chatTitle = otherParticipant.email.split('@')[0];
              }
              if (!chatTitle) {
                chatTitle = `User ${otherParticipant.id.substring(0, 8)}`;
              }
              
              console.log(`      - Would display as: "${chatTitle}"`);
            } else {
              console.log(`      ❌ Would be filtered out!`);
            }
          } else {
            console.log(`   ❌ No other participant found - would be filtered out!`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

identifyMissingChats();
