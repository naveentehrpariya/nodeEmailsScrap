require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixAllMissingParticipants() {
  try {
    console.log('🔧 FIXING ALL CHATS WITH MISSING PARTICIPANTS');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    // Find all direct message chats with 0 participants
    const chatsWithoutParticipants = await Chat.find({
      account: naveendevAccount._id,
      spaceType: 'DIRECT_MESSAGE',
      'participants.0': { $exists: false } // No participants
    }).lean();
    
    console.log(`🎯 FOUND ${chatsWithoutParticipants.length} CHATS WITHOUT PARTICIPANTS:`);
    
    if (chatsWithoutParticipants.length === 0) {
      console.log('✅ All chats already have participants!');
      return;
    }
    
    // Get all accounts and user mappings for reference
    const allAccounts = await Account.find({}).lean();
    const allUserMappings = await UserMapping.find({}).lean();
    
    let fixedCount = 0;
    
    for (const chat of chatsWithoutParticipants) {
      console.log(`\n🔍 PROCESSING: "${chat.displayName}" (${chat.spaceId})`);
      console.log(`   Messages: ${chat.messages.length}`);
      
      let participantToAdd = null;
      
      // Strategy 1: Check if any other account has the same space ID
      console.log(`   Strategy 1: Checking other accounts for same space ID...`);
      for (const account of allAccounts) {
        if (account.email === 'naveendev@crossmilescarrier.com') continue;
        
        const matchingChat = await Chat.findOne({
          account: account._id,
          spaceId: chat.spaceId
        }).lean();
        
        if (matchingChat) {
          console.log(`   ✅ Found matching chat in ${account.email} account`);
          
          // Try to find user mapping for this account
          const userMapping = allUserMappings.find(m => m.email === account.email);
          
          if (userMapping) {
            participantToAdd = {
              userId: userMapping.userId,
              email: userMapping.email,
              displayName: userMapping.displayName,
              type: 'HUMAN'
            };
          } else {
            participantToAdd = {
              userId: `users/inferred_${account.email.replace('@', '_').replace('.', '_')}`,
              email: account.email,
              displayName: account.email.split('@')[0],
              type: 'HUMAN'
            };
          }
          break;
        }
      }
      
      // Strategy 2: If space ID pattern suggests a known user, try to match
      if (!participantToAdd) {
        console.log(`   Strategy 2: Analyzing space ID pattern...`);
        
        // Check if space ID contains any known patterns
        const knownEmails = ['narender@crossmilescarrier.com', 'dispatch@crossmilescarrier.com', 'eric@crossmilescarrier.com'];
        
        for (const email of knownEmails) {
          const userMapping = allUserMappings.find(m => m.email === email);
          if (userMapping) {
            // For now, we can't definitively match without more info
            console.log(`   Found potential match: ${email}`);
          }
        }
      }
      
      // Strategy 3: Analyze message content for clues
      if (!participantToAdd && chat.messages.length > 0) {
        console.log(`   Strategy 3: Analyzing message content...`);
        
        // Look for non-current-user messages
        const otherUserMessages = chat.messages.filter(m => !m.isSentByCurrentUser);
        if (otherUserMessages.length > 0) {
          const otherMessage = otherUserMessages[0];
          console.log(`   Found message from other user: ${otherMessage.senderEmail || otherMessage.senderId}`);
          
          // Try to create participant from sender info
          if (otherMessage.senderEmail) {
            const userMapping = allUserMappings.find(m => m.email === otherMessage.senderEmail);
            if (userMapping) {
              participantToAdd = {
                userId: userMapping.userId,
                email: userMapping.email,
                displayName: userMapping.displayName,
                type: 'HUMAN'
              };
            } else {
              participantToAdd = {
                userId: otherMessage.senderId || `users/inferred_${otherMessage.senderEmail.replace('@', '_').replace('.', '_')}`,
                email: otherMessage.senderEmail,
                displayName: otherMessage.senderDisplayName || otherMessage.senderEmail.split('@')[0],
                type: 'HUMAN'
              };
            }
          }
        }
      }
      
      // Apply the fix if we found a participant
      if (participantToAdd) {
        console.log(`   🔧 Adding participant: ${participantToAdd.displayName} (${participantToAdd.email})`);
        
        const updateResult = await Chat.updateOne(
          { _id: chat._id },
          { 
            $set: { 
              participants: [participantToAdd],
              displayName: participantToAdd.displayName
            } 
          }
        );
        
        if (updateResult.modifiedCount > 0) {
          console.log(`   ✅ Successfully fixed chat`);
          fixedCount++;
        } else {
          console.log(`   ❌ Failed to update chat`);
        }
      } else {
        console.log(`   ⚠️ Could not identify participant for this chat`);
        console.log(`   💡 Manual investigation needed for: ${chat.spaceId}`);
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total chats processed: ${chatsWithoutParticipants.length}`);
    console.log(`   Successfully fixed: ${fixedCount}`);
    console.log(`   Still need manual fixing: ${chatsWithoutParticipants.length - fixedCount}`);
    
    if (fixedCount > 0) {
      console.log(`\n✅ Fixed chats should now appear in the API!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

fixAllMissingParticipants();
