require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function debugRealUserIdentity() {
  try {
    console.log('🔍 DEBUGGING REAL USER IDENTITY FOR NEW MESSAGE');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find the test message chat
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const testChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/2pUolCAAAAE' 
    }).lean();
    
    console.log('🎯 ANALYZING TEST MESSAGE CHAT:');
    console.log(`   Space ID: ${testChat.spaceId}`);
    console.log(`   Display Name: "${testChat.displayName}"`);
    console.log(`   Messages: ${testChat.messages.length}`);
    console.log(`   Participants: ${testChat.participants.length}`);
    
    if (testChat.participants.length > 0) {
      console.log('   Current participants:');
      testChat.participants.forEach(p => {
        console.log(`     - ${p.displayName} (${p.email})`);
      });
    }
    
    if (testChat.messages.length > 0) {
      console.log('\n📨 ANALYZING MESSAGES:');
      testChat.messages.forEach((msg, i) => {
        console.log(`   Message ${i + 1}:`);
        console.log(`     Text: "${msg.text}"`);
        console.log(`     Sender ID: ${msg.senderId}`);
        console.log(`     Sender Email: ${msg.senderEmail}`);
        console.log(`     Sender Display Name: ${msg.senderDisplayName}`);
        console.log(`     Is Current User: ${msg.isSentByCurrentUser}`);
        console.log(`     Create Time: ${msg.createTime}`);
      });
    }
    
    // Check if this space exists in other accounts
    console.log('\n🔍 CHECKING OTHER ACCOUNTS FOR SAME SPACE:');
    const allAccounts = await Account.find({}).lean();
    
    for (const account of allAccounts) {
      if (account.email === 'naveendev@crossmilescarrier.com') continue;
      
      const matchingChat = await Chat.findOne({
        account: account._id,
        spaceId: 'spaces/2pUolCAAAAE'
      }).lean();
      
      if (matchingChat) {
        console.log(`   ✅ FOUND MATCHING CHAT in ${account.email}:`);
        console.log(`      Display Name: "${matchingChat.displayName}"`);
        console.log(`      Messages: ${matchingChat.messages.length}`);
        console.log(`      Participants: ${matchingChat.participants.length}`);
        
        if (matchingChat.messages.length > 0) {
          console.log('      Messages:');
          matchingChat.messages.forEach((msg, i) => {
            console.log(`        ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
          });
        }
        
        // This account is likely the recipient!
        console.log(`   🎯 RECIPIENT IDENTIFIED: ${account.email}`);
        
        // Check if we have user mapping for this account
        const userMapping = await UserMapping.findOne({ email: account.email }).lean();
        if (userMapping) {
          console.log(`   📋 User mapping found:`);
          console.log(`      Display Name: ${userMapping.displayName}`);
          console.log(`      User ID: ${userMapping.userId}`);
          console.log(`      Confidence: ${userMapping.confidence}`);
          
          // Update the chat with correct participant
          console.log('\n🔧 UPDATING CHAT WITH CORRECT PARTICIPANT:');
          const correctParticipant = {
            userId: userMapping.userId,
            email: userMapping.email,
            displayName: userMapping.displayName,
            type: 'HUMAN'
          };
          
          const updateResult = await Chat.updateOne(
            { _id: testChat._id },
            { 
              $set: { 
                participants: [correctParticipant],
                displayName: correctParticipant.displayName
              } 
            }
          );
          
          if (updateResult.modifiedCount > 0) {
            console.log(`   ✅ Successfully updated chat with real name: "${correctParticipant.displayName}"`);
          } else {
            console.log(`   ❌ Failed to update chat`);
          }
          
        } else {
          console.log(`   ⚠️ No user mapping found for ${account.email}`);
          console.log(`   Creating basic participant from account info...`);
          
          const basicParticipant = {
            userId: `users/inferred_${account.email.replace('@', '_').replace('.', '_')}`,
            email: account.email,
            displayName: account.email.split('@')[0],
            type: 'HUMAN'
          };
          
          const updateResult = await Chat.updateOne(
            { _id: testChat._id },
            { 
              $set: { 
                participants: [basicParticipant],
                displayName: basicParticipant.displayName
              } 
            }
          );
          
          if (updateResult.modifiedCount > 0) {
            console.log(`   ✅ Updated chat with basic name: "${basicParticipant.displayName}"`);
          }
        }
        
        break; // Found the recipient, no need to check other accounts
      }
    }
    
    // If no matching account found, check Google Chat API for space members
    console.log('\n🔍 CHECKING GOOGLE CHAT API FOR SPACE MEMBERS:');
    try {
      const { google } = require('googleapis');
      const keys = require('./dispatch.json');
      
      const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly"
      ];

      const auth = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        SCOPES,
        'naveendev@crossmilescarrier.com'
      );

      const chat = google.chat({ version: "v1", auth });
      
      // Get space details
      const spaceRes = await chat.spaces.get({ name: 'spaces/2pUolCAAAAE' });
      console.log('   Space details:', {
        name: spaceRes.data.name,
        displayName: spaceRes.data.displayName,
        spaceType: spaceRes.data.spaceType
      });
      
      // Try to get members of the space
      try {
        const membersRes = await chat.spaces.members.list({ parent: 'spaces/2pUolCAAAAE' });
        const members = membersRes.data.memberships || [];
        
        console.log(`   Found ${members.length} space members:`);
        members.forEach((member, i) => {
          console.log(`     ${i + 1}. ${member.member?.displayName || 'Unknown'}`);
          console.log(`        Email: ${member.member?.domainId || 'Unknown'}`);
          console.log(`        User ID: ${member.member?.name || 'Unknown'}`);
          console.log(`        Type: ${member.member?.type || 'Unknown'}`);
        });
        
        // Find the non-current user member
        const otherMembers = members.filter(member => 
          member.member?.name && 
          !member.member.name.includes('108506371856200018714') // naveendev's user ID
        );
        
        if (otherMembers.length > 0) {
          const otherMember = otherMembers[0];
          console.log(`\n🎯 OTHER MEMBER IDENTIFIED:`);
          console.log(`   Name: ${otherMember.member?.displayName || 'Unknown'}`);
          console.log(`   User ID: ${otherMember.member?.name || 'Unknown'}`);
          
          // Update chat with this information
          if (otherMember.member?.displayName) {
            const memberParticipant = {
              userId: otherMember.member.name,
              email: `${otherMember.member.displayName.toLowerCase().replace(' ', '.')}@crossmilescarrier.com`,
              displayName: otherMember.member.displayName,
              type: 'HUMAN'
            };
            
            const updateResult = await Chat.updateOne(
              { _id: testChat._id },
              { 
                $set: { 
                  participants: [memberParticipant],
                  displayName: memberParticipant.displayName
                } 
              }
            );
            
            if (updateResult.modifiedCount > 0) {
              console.log(`   ✅ Updated chat with real member name: "${memberParticipant.displayName}"`);
            }
          }
        }
        
      } catch (membersError) {
        console.log(`   ⚠️ Could not get space members: ${membersError.message}`);
      }
      
    } catch (apiError) {
      console.log(`   ❌ Google Chat API error: ${apiError.message}`);
    }
    
    // Final verification
    console.log('\n✅ FINAL VERIFICATION:');
    const updatedChat = await Chat.findById(testChat._id).lean();
    console.log(`   Updated display name: "${updatedChat.displayName}"`);
    console.log(`   Participants: ${updatedChat.participants.length}`);
    if (updatedChat.participants.length > 0) {
      updatedChat.participants.forEach(p => {
        console.log(`     - ${p.displayName} (${p.email})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugRealUserIdentity();
