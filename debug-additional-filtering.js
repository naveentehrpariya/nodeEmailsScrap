require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function debugAdditionalFiltering() {
  try {
    console.log('🔍 DEBUGGING ADDITIONAL FILTERING LOGIC');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account and target chats
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const narenderChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/ilSNZCAAAAE' 
    }).lean();
    const dispatchChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/w9y_pCAAAAE' 
    }).lean();
    
    console.log('🎯 TARGET CHATS FOUND:');
    console.log(`Narender: participants=${narenderChat.participants.length}, display="${narenderChat.displayName}"`);
    console.log(`Dispatch: participants=${dispatchChat.participants.length}, display="${dispatchChat.displayName}"`);
    
    // Test the additional filtering logic for both chats
    function testAdditionalFiltering(chat, chatName) {
      console.log(`\n🧪 TESTING ADDITIONAL FILTERING FOR ${chatName.toUpperCase()}:`);
      
      if (chat.spaceType !== 'DIRECT_MESSAGE') {
        console.log('   ✅ Not a DM, will be processed as SPACE');
        return true;
      }
      
      // Find other participant (using our added participants)
      if (!chat.participants || chat.participants.length === 0) {
        console.log('   ❌ No participants found');
        return false;
      }
      
      const nonCurrentUserParticipants = chat.participants.filter(p => 
        p.email !== 'naveendev@crossmilescarrier.com'
      );
      
      if (nonCurrentUserParticipants.length === 0) {
        console.log('   ❌ No non-current-user participants');
        return false;
      }
      
      const otherParticipant = nonCurrentUserParticipants[0];
      console.log(`   👥 Other participant: ${otherParticipant.displayName} (${otherParticipant.email})`);
      
      // Test the additional filtering criteria
      const resolvedName = null; // No Google Directory API resolution
      
      // Test 1: hasResolvedName
      const hasResolvedName = resolvedName && resolvedName !== otherParticipant?.displayName;
      console.log(`   📝 hasResolvedName: ${hasResolvedName} (resolvedName="${resolvedName}", displayName="${otherParticipant?.displayName}")`);
      
      // Test 2: hasProperEmail  
      const hasProperEmail = otherParticipant?.email && 
        otherParticipant.email.includes('@') && 
        !otherParticipant.email.includes('user-') && 
        !otherParticipant.email.endsWith('@unknown');
      console.log(`   📧 hasProperEmail: ${hasProperEmail} (email="${otherParticipant?.email}")`);
      console.log(`       - includes @: ${otherParticipant.email ? otherParticipant.email.includes('@') : 'N/A'}`);
      console.log(`       - includes user-: ${otherParticipant.email ? otherParticipant.email.includes('user-') : 'N/A'}`);
      console.log(`       - ends with @unknown: ${otherParticipant.email ? otherParticipant.email.endsWith('@unknown') : 'N/A'}`);
      
      // Test 3: hasStoredDisplayName
      const hasStoredDisplayName = otherParticipant?.displayName && 
        !otherParticipant.displayName.startsWith('User ') &&
        !otherParticipant.displayName.startsWith('Unknown');
      console.log(`   🏷️  hasStoredDisplayName: ${hasStoredDisplayName} (displayName="${otherParticipant?.displayName}")`);
      console.log(`       - starts with User: ${otherParticipant.displayName ? otherParticipant.displayName.startsWith('User ') : 'N/A'}`);
      console.log(`       - starts with Unknown: ${otherParticipant.displayName ? otherParticipant.displayName.startsWith('Unknown') : 'N/A'}`);
      
      // Determine if should show
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
      } else if (otherParticipant?.email) {
        shouldShow = true;
        showReason = 'email_fallback';
      } else if (otherParticipant?.id) {
        shouldShow = true;
        showReason = 'id_fallback';
      } else {
        shouldShow = false;
        showReason = 'no_participant_info';
      }
      
      console.log(`   📊 RESULT: shouldShow=${shouldShow}, reason="${showReason}"`);
      
      return shouldShow;
    }
    
    const narenderWillShow = testAdditionalFiltering(narenderChat, 'narender');
    const dispatchWillShow = testAdditionalFiltering(dispatchChat, 'dispatch');
    
    console.log('\n📊 FINAL RESULTS:');
    console.log('='.repeat(40));
    console.log(`Narender chat will show: ${narenderWillShow ? '✅ YES' : '❌ NO'}`);
    console.log(`Dispatch chat will show: ${dispatchWillShow ? '✅ YES' : '❌ NO'}`);
    
    if (!narenderWillShow || !dispatchWillShow) {
      console.log('\n⚠️ ISSUE FOUND: Additional filtering logic is rejecting the chats');
      console.log('   Check the specific criteria above that failed.');
    } else {
      console.log('\n🎉 Both chats should pass all filtering criteria!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

debugAdditionalFiltering();
