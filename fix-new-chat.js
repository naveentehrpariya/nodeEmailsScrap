require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixNewChat() {
  try {
    console.log('🔧 FIXING NEW CHAT WITH MISSING PARTICIPANTS');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    // Find the new chat (spaces/2pUolCAAAAE)
    const newChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/2pUolCAAAAE' 
    });
    
    if (!newChat) {
      console.log('❌ New chat not found');
      return;
    }
    
    console.log('🎯 FOUND NEW CHAT:');
    console.log(`   Display Name: "${newChat.displayName}"`);
    console.log(`   Space ID: ${newChat.spaceId}`);
    console.log(`   Messages: ${newChat.messages.length}`);
    console.log(`   Participants: ${newChat.participants.length}`);
    
    if (newChat.messages.length > 0) {
      console.log(`\n📨 ANALYZING MESSAGES:`);
      newChat.messages.forEach((msg, i) => {
        console.log(`   ${i + 1}. "${msg.text}" (from: ${msg.senderEmail || msg.senderId})`);
        console.log(`      Sent by current user: ${msg.isSentByCurrentUser}`);
        console.log(`      Create time: ${msg.createTime}`);
      });
      
      // Try to identify the recipient from the message or space context
      // Since this is a one-sided conversation (only naveendev messages), we need to infer the recipient
      
      console.log(`\n🔍 ATTEMPTING TO IDENTIFY RECIPIENT:`);
      
      // Check all existing accounts to see if any have this same space ID
      console.log(`   Checking other accounts for the same space ID...`);
      
      const allAccounts = await Account.find({}).lean();
      let recipientAccount = null;
      
      for (const account of allAccounts) {
        if (account.email === 'naveendev@crossmilescarrier.com') continue;
        
        const matchingChat = await Chat.findOne({
          account: account._id,
          spaceId: 'spaces/2pUolCAAAAE'
        }).lean();
        
        if (matchingChat) {
          recipientAccount = account;
          console.log(`   ✅ Found matching chat in ${account.email} account`);
          console.log(`      Their chat has ${matchingChat.messages.length} messages`);
          break;
        }
      }
      
      if (recipientAccount) {
        // We found who the recipient is!
        console.log(`\n🎯 RECIPIENT IDENTIFIED: ${recipientAccount.email}`);
        
        // Check if we have a user mapping for this recipient
        const recipientMapping = await UserMapping.findOne({
          email: recipientAccount.email
        }).lean();
        
        let participantToAdd;
        if (recipientMapping) {
          participantToAdd = {
            userId: recipientMapping.userId,
            email: recipientMapping.email,
            displayName: recipientMapping.displayName,
            type: 'HUMAN'
          };
        } else {
          // Fallback: create participant from account info
          participantToAdd = {
            userId: `users/inferred_${recipientAccount.email.replace('@', '_').replace('.', '_')}`,
            email: recipientAccount.email,
            displayName: recipientAccount.email.split('@')[0],
            type: 'HUMAN'
          };
        }
        
        // Update the chat with the participant
        const updateResult = await Chat.updateOne(
          { _id: newChat._id },
          { 
            $set: { 
              participants: [participantToAdd],
              displayName: participantToAdd.displayName
            } 
          }
        );
        
        if (updateResult.modifiedCount > 0) {
          console.log(`✅ Successfully added participant to new chat`);
          console.log(`   Participant: ${participantToAdd.displayName} (${participantToAdd.email})`);
          console.log(`   Display name updated to: "${participantToAdd.displayName}"`);
        } else {
          console.log(`❌ Failed to update chat`);
        }
        
      } else {
        console.log(`⚠️ Could not identify recipient from existing accounts`);
        console.log(`   This might be a message to someone not in the system yet`);
        console.log(`   Or the recipient's chat sync hasn't completed yet`);
        
        // Try to infer from message content or other clues
        console.log(`\n💡 Manual investigation needed:`);
        console.log(`   1. Check Google Chat to see who you sent the message to`);
        console.log(`   2. Ensure that user's account is synced in the system`);
        console.log(`   3. Try running chat sync for the recipient's account`);
      }
      
    } else {
      console.log(`❌ No messages found in the chat`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

fixNewChat();
