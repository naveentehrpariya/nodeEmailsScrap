require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixOneSidedConversations() {
  try {
    console.log('🔧 FIXING ONE-SIDED CONVERSATIONS IN CHATCONTROLLER');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // First, let's gather information about the problematic chats
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const narenderChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/ilSNZCAAAAE' 
    });
    const dispatchChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/w9y_pCAAAAE' 
    });
    
    console.log('📊 ANALYZING TARGET CHATS:');
    console.log(`Narender chat messages: ${narenderChat.messages.length}`);
    console.log(`Dispatch chat messages: ${dispatchChat.messages.length}`);
    
    // Show the messages to understand the conversations
    if (narenderChat.messages.length > 0) {
      console.log('\n🗨️ Narender chat messages:');
      narenderChat.messages.forEach((msg, i) => {
        console.log(`   ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
      });
    }
    
    if (dispatchChat.messages.length > 0) {
      console.log('\n🗨️ Dispatch chat messages:');
      dispatchChat.messages.forEach((msg, i) => {
        console.log(`   ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
      });
    }
    
    // Get user mappings for context
    const narenderMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'narender', $options: 'i' } },
        { displayName: { $regex: 'narender', $options: 'i' } }
      ]
    }).lean();
    
    const dispatchMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'dispatch', $options: 'i' } },
        { displayName: { $regex: 'dispatch', $options: 'i' } }
      ]
    }).lean();
    
    console.log('\n👥 USER MAPPINGS:');
    console.log('Narender mappings:');
    narenderMappings.forEach(m => {
      console.log(`   - ${m.displayName} (${m.email}) - ${m.userId}`);
    });
    
    console.log('Dispatch mappings:');
    dispatchMappings.forEach(m => {
      console.log(`   - ${m.displayName} (${m.email}) - ${m.userId}`);
    });
    
    // The solution: Add participants based on space context and user mappings
    console.log('\n🔧 APPLYING SOLUTION:');
    console.log('Strategy: Add inferred participants to enable these chats to show in API');
    
    // Add narender participant
    if (narenderMappings.length > 0) {
      const bestNarenderMapping = narenderMappings.find(m => m.email === 'narender@crossmilescarrier.com') || narenderMappings[0];
      
      const narenderParticipant = {
        userId: bestNarenderMapping.userId,
        email: bestNarenderMapping.email,
        displayName: bestNarenderMapping.displayName || 'narender',
        type: 'HUMAN'
      };
      
      const narenderUpdate = await Chat.updateOne(
        { _id: narenderChat._id },
        { 
          $set: { 
            participants: [narenderParticipant],
            displayName: narenderParticipant.displayName
          } 
        }
      );
      
      if (narenderUpdate.modifiedCount > 0) {
        console.log('✅ Added narender participant');
      } else {
        console.log('❌ Failed to update narender chat');
      }
    }
    
    // Add dispatch participant
    if (dispatchMappings.length > 0) {
      const bestDispatchMapping = dispatchMappings.find(m => m.email === 'dispatch@crossmilescarrier.com') || dispatchMappings[0];
      
      const dispatchParticipant = {
        userId: bestDispatchMapping.userId,
        email: bestDispatchMapping.email,
        displayName: bestDispatchMapping.displayName || 'dispatch',
        type: 'HUMAN'
      };
      
      const dispatchUpdate = await Chat.updateOne(
        { _id: dispatchChat._id },
        { 
          $set: { 
            participants: [dispatchParticipant],
            displayName: dispatchParticipant.displayName
          } 
        }
      );
      
      if (dispatchUpdate.modifiedCount > 0) {
        console.log('✅ Added dispatch participant');
      } else {
        console.log('❌ Failed to update dispatch chat');
      }
    }
    
    // Verify the fix
    console.log('\n🔍 VERIFYING THE FIX:');
    const updatedNarenderChat = await Chat.findById(narenderChat._id).lean();
    const updatedDispatchChat = await Chat.findById(dispatchChat._id).lean();
    
    console.log(`Narender chat participants: ${updatedNarenderChat.participants.length}`);
    if (updatedNarenderChat.participants.length > 0) {
      updatedNarenderChat.participants.forEach(p => {
        console.log(`   - ${p.displayName} (${p.email})`);
      });
    }
    
    console.log(`Dispatch chat participants: ${updatedDispatchChat.participants.length}`);
    if (updatedDispatchChat.participants.length > 0) {
      updatedDispatchChat.participants.forEach(p => {
        console.log(`   - ${p.displayName} (${p.email})`);
      });
    }
    
    // Test the API logic
    console.log('\n🧪 TESTING API FILTERING LOGIC:');
    
    // Simulate the filtering for narender chat
    const narenderWillShow = updatedNarenderChat.participants.length > 0 && 
      updatedNarenderChat.participants.some(p => p.email !== 'naveendev@crossmilescarrier.com');
    
    const dispatchWillShow = updatedDispatchChat.participants.length > 0 && 
      updatedDispatchChat.participants.some(p => p.email !== 'naveendev@crossmilescarrier.com');
    
    console.log(`Narender chat will show: ${narenderWillShow ? '✅ YES' : '❌ NO'}`);
    console.log(`Dispatch chat will show: ${dispatchWillShow ? '✅ YES' : '❌ NO'}`);
    
    if (narenderWillShow && dispatchWillShow) {
      console.log('\n🎉 SUCCESS: Both one-sided conversations should now appear in the API!');
      console.log('   The chats will show even though they contain only outgoing messages');
      console.log('   because we\'ve added the intended recipients as participants.');
    } else {
      console.log('\n⚠️ Issue persists - please check the participant data');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

fixOneSidedConversations();
