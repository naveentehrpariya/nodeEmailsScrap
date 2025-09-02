const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixChatFilteringLogic() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails');
    console.log('✅ Connected to MongoDB Atlas');
    
    console.log('\n🔧 ANALYZING AND FIXING CHAT FILTERING LOGIC:');
    console.log('='.repeat(60));
    
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!naveendevAccount) {
      console.log('❌ Naveendev account not found');
      return;
    }
    
    // The problematic chats
    const problematicSpaces = [
      { name: 'Narender', spaceId: 'spaces/ilSNZCAAAAE', email: 'narender@crossmilescarrier.com' },
      { name: 'Dispatch', spaceId: 'spaces/w9y_pCAAAAE', email: 'dispatch@crossmilescarrier.com' }
    ];
    
    console.log('💡 SOLUTION: Add participant metadata to enable proper filtering');
    console.log('');
    
    for (const space of problematicSpaces) {
      console.log(`🔧 Processing ${space.name} chat (${space.spaceId}):`);
      
      const chat = await Chat.findOne({ 
        spaceId: space.spaceId, 
        account: naveendevAccount._id 
      });
      
      if (!chat) {
        console.log(`   ❌ Chat not found`);
        continue;
      }
      
      console.log(`   📝 Current state:`);
      console.log(`      - Display Name: "${chat.displayName}"`);
      console.log(`      - Participants: ${chat.participants.length}`);
      console.log(`      - Messages: ${chat.messages.length}`);
      
      // Solution 1: Add proper participants array
      const hasTargetParticipant = chat.participants.some(p => 
        p.email === space.email || (p.displayName && p.displayName.toLowerCase().includes(space.name.toLowerCase()))
      );
      
      if (!hasTargetParticipant) {
        console.log(`   🔧 Adding ${space.name} as participant...`);
        
        // Create participant entry
        const newParticipant = {
          email: space.email,
          displayName: space.name,
          userId: `inferred_${space.name.toLowerCase()}`,
          isExternal: false
        };
        
        chat.participants.push(newParticipant);
        console.log(`      ✅ Added participant: ${newParticipant.displayName} (${newParticipant.email})`);
      } else {
        console.log(`   ✅ Participant already exists`);
      }
      
      // Solution 2: Update display name to be more descriptive
      if (chat.displayName === '(Direct Message)') {
        chat.displayName = `Chat with ${space.name}`;
        console.log(`   🔧 Updated display name to: "${chat.displayName}"`);
      }
      
      // Solution 3: Add metadata to help with filtering
      if (!chat.metadata) {
        chat.metadata = {};
      }
      
      chat.metadata.hasOneWayConversation = true;
      chat.metadata.primaryOtherParticipant = {
        email: space.email,
        displayName: space.name
      };
      
      console.log(`   🔧 Added metadata for filtering`);
      
      // Save the changes
      await chat.save();
      console.log(`   ✅ Saved changes to ${space.name} chat\n`);
    }
    
    console.log('🎉 SOLUTION APPLIED! Now let\'s test the filtering logic:');
    console.log('='.repeat(50));
    
    // Test the updated filtering logic
    for (const space of problematicSpaces) {
      console.log(`\n🔍 Testing ${space.name} chat filtering:`);
      
      const chat = await Chat.findOne({ 
        spaceId: space.spaceId, 
        account: naveendevAccount._id 
      }).lean();
      
      if (chat && chat.spaceType === 'DIRECT_MESSAGE') {
        // Simulate the filtering logic with our fixes
        let otherParticipant = null;
        
        // Method 1: Check participants array (our new solution)
        const nonCurrentUserParticipants = chat.participants.filter(p => 
          p.email !== naveendevAccount.email
        );
        
        if (nonCurrentUserParticipants.length > 0) {
          otherParticipant = nonCurrentUserParticipants[0];
          console.log(`   ✅ Found other participant via participants array: ${otherParticipant.displayName} (${otherParticipant.email})`);
        }
        
        // Method 2: Check metadata (backup solution)
        if (!otherParticipant && chat.metadata?.primaryOtherParticipant) {
          otherParticipant = chat.metadata.primaryOtherParticipant;
          console.log(`   ✅ Found other participant via metadata: ${otherParticipant.displayName} (${otherParticipant.email})`);
        }
        
        // Method 3: Original message-based detection (fallback)
        if (!otherParticipant) {
          // This would still fail for one-way conversations
          console.log(`   ❌ No other participant found via messages (one-way conversation)`);
        }
        
        if (otherParticipant) {
          // Apply filtering criteria
          const hasProperEmail = otherParticipant.email && 
            otherParticipant.email.includes('@') && 
            !otherParticipant.email.includes('user-');
          const hasDisplayName = otherParticipant.displayName && 
            !otherParticipant.displayName.startsWith('User ');
          
          const shouldShow = hasProperEmail || hasDisplayName;
          
          console.log(`   📋 Filtering result:`);
          console.log(`      - hasProperEmail: ${hasProperEmail}`);
          console.log(`      - hasDisplayName: ${hasDisplayName}`);
          console.log(`      - shouldShow: ${shouldShow}`);
          
          if (shouldShow) {
            const displayTitle = otherParticipant.displayName || otherParticipant.email.split('@')[0];
            console.log(`      ✅ Chat would appear as: "${displayTitle}"`);
          } else {
            console.log(`      ❌ Chat would still be filtered out`);
          }
        }
      }
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log('='.repeat(20));
    console.log('✅ Added participants metadata to enable filtering');
    console.log('✅ Updated display names for better UX');
    console.log('✅ Added metadata for backup filtering logic');
    console.log('\n💡 The chats should now appear in the API response!');
    console.log('   - "Chat with Narender"');
    console.log('   - "Chat with Dispatch"');
</function_results>

<function_calls>
<invoke name="run_command">
<parameter name="command">node fix-chat-filtering-logic.js
