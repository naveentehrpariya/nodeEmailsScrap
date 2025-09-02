require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function debugAPIFiltering() {
  try {
    console.log('🔍 DEBUGGING API FILTERING LOGIC');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!naveendevAccount) {
      console.log('❌ NAVEENDEV ACCOUNT NOT FOUND!');
      return;
    }
    
    console.log(`👤 Found naveendev account: ${naveendevAccount._id}`);
    
    // Get all chats for this account (before any filtering)
    const allChats = await Chat.find({ account: naveendevAccount._id })
      .sort({ lastMessageTime: -1 })
      .lean();
    
    console.log(`📝 Total chats in database: ${allChats.length}`);
    
    // Find our specific chats
    const narenderChat = allChats.find(c => c.spaceId === 'spaces/ilSNZCAAAAE');
    const dispatchChat = allChats.find(c => c.spaceId === 'spaces/w9y_pCAAAAE');
    
    console.log(`\n🎯 TARGET CHATS:`);
    console.log(`   Narender chat found: ${narenderChat ? 'YES' : 'NO'}`);
    console.log(`   Dispatch chat found: ${dispatchChat ? 'YES' : 'NO'}`);
    
    if (narenderChat) {
      console.log(`   Narender - Display Name: "${narenderChat.displayName}"`);
      console.log(`   Narender - Space Type: ${narenderChat.spaceType}`);
      console.log(`   Narender - Participants: ${narenderChat.participants.length}`);
      if (narenderChat.participants.length > 0) {
        narenderChat.participants.forEach(p => {
          console.log(`     - ${p.displayName} (${p.email})`);
        });
      }
      console.log(`   Narender - Messages: ${narenderChat.messages.length}`);
    }
    
    if (dispatchChat) {
      console.log(`   Dispatch - Display Name: "${dispatchChat.displayName}"`);
      console.log(`   Dispatch - Space Type: ${dispatchChat.spaceType}`);
      console.log(`   Dispatch - Participants: ${dispatchChat.participants.length}`);
      if (dispatchChat.participants.length > 0) {
        dispatchChat.participants.forEach(p => {
          console.log(`     - ${p.displayName} (${p.email})`);
        });
      }
      console.log(`   Dispatch - Messages: ${dispatchChat.messages.length}`);
    }
    
    // Simulate the exact API filtering logic step by step
    console.log(`\n🔬 SIMULATING API FILTERING LOGIC:`);
    console.log('-'.repeat(50));
    
    const formattedChats = [];
    const chatDeduplicationMap = new Map();
    
    for (let i = 0; i < allChats.length; i++) {
      const chat = allChats[i];
      const isTarget = (chat.spaceId === 'spaces/ilSNZCAAAAE' || chat.spaceId === 'spaces/w9y_pCAAAAE');
      
      if (isTarget) {
        console.log(`\n🎯 PROCESSING TARGET CHAT #${i + 1}: ${chat.displayName} (${chat.spaceId})`);
      } else {
        console.log(`\n📄 Processing chat #${i + 1}: ${chat.displayName} (${chat.spaceType})`);
      }
      
      // Get the last message info from stored data
      let lastMessage = 'No messages';
      if (chat.messages.length > 0) {
        const lastMsg = chat.messages[chat.messages.length - 1];
        let senderName = 'Unknown';
        
        if (lastMsg.isSentByCurrentUser) {
          senderName = 'You';
        } else {
          senderName = lastMsg.senderDisplayName || 
                     (lastMsg.senderEmail ? lastMsg.senderEmail.split('@')[0] : 'Unknown');
        }
        
        lastMessage = `${senderName}: ${lastMsg.text || '(no text)'}`;
      }
      
      // Determine chat title
      let chatTitle = chat.displayName || '';
      let chatAvatar = '👥';
      
      if (chat.spaceType === 'DIRECT_MESSAGE') {
        console.log(`   📱 This is a DIRECT MESSAGE chat`);
        
        // For direct messages: try to resolve real names
        let otherParticipantName = null;
        let otherParticipant = null;
        
        // Step 1: First try to find other participant from participants array
        console.log(`   📋 Step 1: Checking participants array...`);
        if (chat.participants && chat.participants.length > 0) {
          console.log(`      Found ${chat.participants.length} participants:`);
          chat.participants.forEach(p => {
            console.log(`        - ${p.displayName || 'no name'} (${p.email || 'no email'})`);
          });
          
          const nonCurrentUserParticipants = chat.participants.filter(p => 
            p.email !== naveendevAccount.email && p.email !== `${naveendevAccount.email}`
          );
          
          console.log(`      Non-current-user participants: ${nonCurrentUserParticipants.length}`);
          
          if (nonCurrentUserParticipants.length > 0) {
            const participant = nonCurrentUserParticipants[0];
            otherParticipant = {
              id: participant.userId || `inferred_${participant.email}`,
              email: participant.email,
              displayName: participant.displayName,
              count: 1
            };
            console.log(`      ✅ Found other participant via participants array: ${otherParticipant.email} - ${otherParticipant.displayName}`);
          } else {
            console.log(`      ❌ No valid non-current-user participants found`);
          }
        } else {
          console.log(`      ❌ No participants array or it's empty`);
        }
        
        // Step 2: FALLBACK - If no participant found via participants array, try message analysis
        if (!otherParticipant) {
          console.log(`   🔍 Step 2: Analyzing messages for participants...`);
          
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
          
          console.log(`      Found ${allSenders.size} unique senders in messages:`);
          for (const [senderId, info] of allSenders.entries()) {
            console.log(`        - ${senderId}: ${info.email || 'no email'} (${info.count} messages, currentUser: ${info.isSentByCurrentUser})`);
          }
          
          // Find the other participant (not the current user)
          let currentUserParticipant = null;
          
          for (const [senderId, info] of allSenders.entries()) {
            const isCurrentUser = info.email === naveendevAccount.email || info.isSentByCurrentUser;
            
            if (isCurrentUser) {
              currentUserParticipant = { id: senderId, ...info };
              console.log(`        ✅ Identified current user: ${senderId} (${info.email || 'no email'})`);
            } else {
              // This is another participant
              if (!otherParticipant || info.count > otherParticipant.count) {
                otherParticipant = {
                  id: senderId,
                  email: info.email,
                  displayName: info.displayName,
                  count: info.count
                };
                console.log(`        ✅ Found other participant via messages: ${senderId} (${info.email || 'no email'}) - ${info.displayName}`);
              }
            }
          }
        }
        
        // Step 3: BACKUP - Try metadata if still no participant found
        if (!otherParticipant && chat.metadata && chat.metadata.primaryOtherParticipant) {
          console.log(`   🔍 Step 3: Checking metadata...`);
          const metaParticipant = chat.metadata.primaryOtherParticipant;
          otherParticipant = {
            id: `metadata_${metaParticipant.email}`,
            email: metaParticipant.email,
            displayName: metaParticipant.displayName,
            count: 1
          };
          console.log(`      ✅ Found other participant via metadata: ${otherParticipant.email} - ${otherParticipant.displayName}`);
        }
        
        // Debug logging
        console.log(`   📊 Final participant analysis:`);
        console.log(`      Other participant: ${otherParticipant ? `${otherParticipant.email || 'no email'} - ${otherParticipant.displayName || 'no name'}` : 'NOT FOUND'}`);
        
        // ⚠️ CRITICAL DECISION POINT ⚠️
        if (!otherParticipant) {
          if (isTarget) {
            console.log(`   ❌ TARGET CHAT SKIPPED: No other participant found`);
          } else {
            console.log(`   ❌ CHAT SKIPPED: No other participant found`);
          }
          continue; // This is the line that skips the chat!
        }
        
        if (isTarget) {
          console.log(`   ✅ TARGET CHAT PASSED: Other participant found, continuing with processing...`);
        }
      }
      
      // If we reach here, the chat should be included
      if (isTarget) {
        console.log(`   ✅ TARGET CHAT WILL BE INCLUDED IN FINAL RESULTS`);
      }
      
      // Count as processed
      formattedChats.push({
        _id: chat._id,
        displayName: chat.displayName,
        spaceType: chat.spaceType,
        spaceId: chat.spaceId
      });
    }
    
    console.log(`\n📊 FILTERING RESULTS:`);
    console.log(`=`.repeat(40));
    console.log(`Total chats in database: ${allChats.length}`);
    console.log(`Chats that passed filtering: ${formattedChats.length}`);
    
    const passedNarender = formattedChats.some(c => c.spaceId === 'spaces/ilSNZCAAAAE');
    const passedDispatch = formattedChats.some(c => c.spaceId === 'spaces/w9y_pCAAAAE');
    
    console.log(`Narender chat passed: ${passedNarender ? '✅ YES' : '❌ NO'}`);
    console.log(`Dispatch chat passed: ${passedDispatch ? '✅ YES' : '❌ NO'}`);
    
    if (!passedNarender || !passedDispatch) {
      console.log(`\n⚠️ ISSUE IDENTIFIED: Target chats are still being filtered out during API processing`);
      console.log(`   This means the participant detection logic is still not working correctly.`);
    } else {
      console.log(`\n🎉 SUCCESS: Both target chats are now passing the filtering logic!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

debugAPIFiltering();
