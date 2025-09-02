require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixChatParticipants() {
  try {
    console.log('🔧 FIXING CHAT PARTICIPANTS FOR MISSING CHATS');
    console.log('='.repeat(60));
    
    // Connect using the correct environment configuration
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database using application configuration');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!naveendevAccount) {
      console.log('❌ NAVEENDEV ACCOUNT NOT FOUND!');
      return;
    }
    
    console.log(`👤 Working with naveendev account: ${naveendevAccount._id}`);
    
    // Get the specific problematic chats
    const narenderChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/ilSNZCAAAAE' 
    });
    
    const dispatchChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/w9y_pCAAAAE' 
    });
    
    if (!narenderChat) {
      console.log('❌ Narender chat not found');
      return;
    }
    if (!dispatchChat) {
      console.log('❌ Dispatch chat not found');
      return;
    }
    
    console.log('✅ Found both chats');
    console.log(`   Narender chat: ${narenderChat.messages.length} messages, ${narenderChat.participants.length} participants`);
    console.log(`   Dispatch chat: ${dispatchChat.messages.length} messages, ${dispatchChat.participants.length} participants`);
    
    // Get user mappings to help infer participants
    const allUserMappings = await UserMapping.find({}).lean();
    console.log(`📋 Found ${allUserMappings.length} user mappings`);
    
    // Function to infer participants from chat space ID and messages
    function inferParticipantFromChat(chat, chatName, expectedEmail) {
      console.log(`\n🔍 Analyzing ${chatName} chat:`);
      console.log(`   Space ID: ${chat.spaceId}`);
      console.log(`   Messages: ${chat.messages.length}`);
      
      // Look for user mappings that might correspond to this chat
      const potentialMappings = allUserMappings.filter(mapping => 
        mapping.email && mapping.email.toLowerCase().includes(chatName.toLowerCase())
      );
      
      console.log(`   Found ${potentialMappings.length} potential user mappings:`);
      potentialMappings.forEach(m => {
        console.log(`     - ${m.displayName} (${m.email}) - ${m.userId}`);
      });
      
      // Try to find the best match
      let bestMapping = null;
      if (potentialMappings.length > 0) {
        // Prefer exact email match
        bestMapping = potentialMappings.find(m => m.email === expectedEmail) || potentialMappings[0];
      }
      
      if (bestMapping) {
        console.log(`   ✅ Selected mapping: ${bestMapping.displayName} (${bestMapping.email})`);
        return {
          userId: bestMapping.userId,
          email: bestMapping.email,
          displayName: bestMapping.displayName,
          type: 'HUMAN'
        };
      }
      
      // Fallback: create participant based on expected email
      console.log(`   ⚠️ No mapping found, creating fallback participant`);
      return {
        userId: `users/inferred_${expectedEmail.replace('@', '_').replace('.', '_')}`,
        email: expectedEmail,
        displayName: chatName.charAt(0).toUpperCase() + chatName.slice(1),
        type: 'HUMAN'
      };
    }
    
    // Fix narender chat
    console.log('\n🔧 FIXING NARENDER CHAT:');
    let narenderParticipant = null;
    
    if (narenderChat.participants.length === 0) {
      narenderParticipant = inferParticipantFromChat(narenderChat, 'narender', 'narender@crossmilescarrier.com');
      
      const updateResult = await Chat.updateOne(
        { _id: narenderChat._id },
        { 
          $set: { 
            participants: [narenderParticipant],
            displayName: `${narenderParticipant.displayName}` // Update display name too
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('   ✅ Added participant to narender chat');
        console.log(`      Participant: ${narenderParticipant.displayName} (${narenderParticipant.email})`);
      } else {
        console.log('   ❌ Failed to update narender chat');
      }
    } else {
      console.log('   ℹ️ Narender chat already has participants');
    }
    
    // Fix dispatch chat
    console.log('\n🔧 FIXING DISPATCH CHAT:');
    let dispatchParticipant = null;
    
    if (dispatchChat.participants.length === 0) {
      dispatchParticipant = inferParticipantFromChat(dispatchChat, 'dispatch', 'dispatch@crossmilescarrier.com');
      
      const updateResult = await Chat.updateOne(
        { _id: dispatchChat._id },
        { 
          $set: { 
            participants: [dispatchParticipant],
            displayName: `${dispatchParticipant.displayName}` // Update display name too
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('   ✅ Added participant to dispatch chat');
        console.log(`      Participant: ${dispatchParticipant.displayName} (${dispatchParticipant.email})`);
      } else {
        console.log('   ❌ Failed to update dispatch chat');
      }
    } else {
      console.log('   ℹ️ Dispatch chat already has participants');
    }
    
    // Verify the changes
    console.log('\n🔍 VERIFYING CHANGES:');
    
    const updatedNarenderChat = await Chat.findById(narenderChat._id).lean();
    const updatedDispatchChat = await Chat.findById(dispatchChat._id).lean();
    
    console.log('Updated Narender Chat:');
    console.log(`   Display Name: "${updatedNarenderChat.displayName}"`);
    console.log(`   Participants: ${updatedNarenderChat.participants.length}`);
    if (updatedNarenderChat.participants.length > 0) {
      updatedNarenderChat.participants.forEach(p => {
        console.log(`     - ${p.displayName} (${p.email})`);
      });
    }
    
    console.log('Updated Dispatch Chat:');
    console.log(`   Display Name: "${updatedDispatchChat.displayName}"`);
    console.log(`   Participants: ${updatedDispatchChat.participants.length}`);
    if (updatedDispatchChat.participants.length > 0) {
      updatedDispatchChat.participants.forEach(p => {
        console.log(`     - ${p.displayName} (${p.email})`);
      });
    }
    
    // Final test: Run the same logic as the API to see if these chats would now be shown
    console.log('\n🧪 TESTING API FILTERING LOGIC:');
    
    function testChatFiltering(chat, chatName) {
      console.log(`\nTesting ${chatName}:`);
      console.log(`   Participants: ${chat.participants.length}`);
      
      if (chat.spaceType === 'DIRECT_MESSAGE') {
        let otherParticipant = null;
        
        // Test participants array first (NEW logic)
        if (chat.participants && chat.participants.length > 0) {
          const nonCurrentUserParticipants = chat.participants.filter(p => 
            p.email !== 'naveendev@crossmilescarrier.com'
          );
          
          if (nonCurrentUserParticipants.length > 0) {
            otherParticipant = nonCurrentUserParticipants[0];
            console.log(`   ✅ Found other participant via participants array: ${otherParticipant.email}`);
          }
        }
        
        // Test message analysis fallback
        if (!otherParticipant) {
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
          
          for (const [senderId, info] of allSenders.entries()) {
            const isCurrentUser = info.email === 'naveendev@crossmilescarrier.com' || info.isSentByCurrentUser;
            
            if (!isCurrentUser && (!otherParticipant || info.count > otherParticipant.count)) {
              otherParticipant = {
                id: senderId,
                email: info.email,
                displayName: info.displayName,
                count: info.count
              };
            }
          }
          
          if (otherParticipant) {
            console.log(`   ✅ Found other participant via message analysis: ${otherParticipant.email || 'no email'}`);
          }
        }
        
        if (!otherParticipant) {
          console.log(`   ❌ NO OTHER PARTICIPANT FOUND - CHAT WOULD BE SKIPPED`);
          return false;
        } else {
          console.log(`   ✅ CHAT WOULD BE SHOWN`);
          return true;
        }
      }
      
      return true;
    }
    
    const narenderWouldShow = testChatFiltering(updatedNarenderChat, 'narender');
    const dispatchWouldShow = testChatFiltering(updatedDispatchChat, 'dispatch');
    
    // Final summary
    console.log('\n📊 FINAL SUMMARY:');
    console.log('='.repeat(40));
    console.log(`Narender chat: ${narenderWouldShow ? '✅ WILL BE SHOWN' : '❌ STILL HIDDEN'}`);
    console.log(`Dispatch chat: ${dispatchWouldShow ? '✅ WILL BE SHOWN' : '❌ STILL HIDDEN'}`);
    
    if (narenderWouldShow && dispatchWouldShow) {
      console.log('\n🎉 SUCCESS: Both chats should now appear in the API!');
    } else {
      console.log('\n⚠️ Some chats may still be hidden. Review the analysis above.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

fixChatParticipants();
