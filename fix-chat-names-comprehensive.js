require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixChatNamesComprehensive() {
  try {
    console.log('🔧 COMPREHENSIVE CHAT NAMES AND PARTICIPANTS FIX');
    console.log('='.repeat(60));

    await mongoose.connect(process.env.DB_URL_OFFICE || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Get the naveendev account
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const chats = await Chat.find({ account: account._id }).lean();

    console.log(`👤 Account: ${account.email}`);
    console.log(`📊 Processing ${chats.length} chats\n`);

    let updatedCount = 0;

    for (const [index, chat] of chats.entries()) {
      console.log(`${index + 1}. Processing: "${chat.displayName}" (${chat.spaceType})`);
      console.log(`   Messages: ${chat.messages?.length || 0}`);
      console.log(`   Current Participants: ${chat.participants?.length || 0}`);

      let shouldUpdate = false;
      let newDisplayName = chat.displayName;
      let newParticipants = [...(chat.participants || [])];

      // Add participant info to each message for better identification
      let updatedMessages = [];
      if (chat.messages && chat.messages.length > 0) {
        console.log(`   📨 Adding participant info to ${chat.messages.length} messages...`);
        
        for (const message of chat.messages) {
          let updatedMessage = { ...message };
          
          // Add recipient identification to each message
          if (chat.spaceType === 'DIRECT_MESSAGE') {
            // For direct messages, recipient is the other participant
            const otherParticipants = chat.participants?.filter(p => 
              p.email !== account.email
            ) || [];
            
            if (otherParticipants.length > 0) {
              updatedMessage.recipientId = otherParticipants[0].userId;
              updatedMessage.recipientEmail = otherParticipants[0].email;
              updatedMessage.recipientDisplayName = otherParticipants[0].displayName;
            }
          } else {
            // For group chats, recipients are all other participants
            updatedMessage.groupParticipants = chat.participants?.filter(p => 
              p.email !== message.senderEmail
            ) || [];
          }
          
          updatedMessages.push(updatedMessage);
        }
        shouldUpdate = true;
      }

      if (chat.spaceType === 'DIRECT_MESSAGE') {
        console.log(`   💬 Processing Direct Message chat...`);

        // STRATEGY: Prioritize participants array, fallback to message analysis
        let otherParticipant = null;

        // PRIORITY 1: Use existing participants array if meaningful
        if (chat.participants && chat.participants.length > 1) {
          const otherParticipants = chat.participants.filter(p => 
            p.email !== account.email
          );
          
          if (otherParticipants.length > 0) {
            otherParticipant = otherParticipants[0];
            console.log(`   ✅ Using existing participant: ${otherParticipant.displayName} <${otherParticipant.email}>`);
          }
        }

        // PRIORITY 2: If no meaningful participants, analyze messages to find other party
        if (!otherParticipant && chat.messages && chat.messages.length > 0) {
          console.log(`   🔍 Analyzing messages to identify other participant...`);
          
          const senderEmails = new Set();
          chat.messages.forEach(msg => {
            if (msg.senderEmail && msg.senderEmail !== account.email) {
              senderEmails.add(msg.senderEmail);
            }
          });

          if (senderEmails.size > 0) {
            const otherEmail = Array.from(senderEmails)[0];
            console.log(`   📧 Found other email in messages: ${otherEmail}`);

            // Look up in UserMapping
            const userMapping = await UserMapping.findOne({ email: otherEmail }).lean();
            
            if (userMapping) {
              otherParticipant = {
                userId: userMapping.userId,
                email: userMapping.email,
                displayName: userMapping.displayName,
                type: 'HUMAN'
              };
              console.log(`   ✅ Resolved via UserMapping: ${userMapping.displayName}`);
              
              // Add this participant to the participants array
              newParticipants = [
                {
                  userId: 'users/108506371856200018714',
                  email: account.email,
                  displayName: 'naveendev',
                  type: 'HUMAN'
                },
                otherParticipant
              ];
              shouldUpdate = true;
            } else {
              // Create fallback participant for external/unknown user
              const isExternal = !otherEmail.endsWith('@crossmilescarrier.com');
              const displayName = isExternal ? 
                `${otherEmail.split('@')[0]} (External)` : 
                otherEmail.split('@')[0];
              
              otherParticipant = {
                userId: `external_${otherEmail.replace('@', '_').replace('.', '_')}`,
                email: otherEmail,
                displayName: displayName,
                type: 'HUMAN'
              };
              
              console.log(`   📧 Created ${isExternal ? 'external' : 'internal'} participant: ${displayName}`);
              
              newParticipants = [
                {
                  userId: 'users/108506371856200018714',
                  email: account.email,
                  displayName: 'naveendev',
                  type: 'HUMAN'
                },
                otherParticipant
              ];
              shouldUpdate = true;
            }
          }
        }

        // PRIORITY 3: Determine chat display name
        if (otherParticipant) {
          // Use the other participant's name as chat title
          newDisplayName = otherParticipant.displayName;
          console.log(`   📝 Setting chat name to: "${newDisplayName}"`);
          shouldUpdate = true;
        } else {
          // One-way conversation - use a descriptive name
          if (chat.displayName === '(Direct Message)' || chat.displayName === 'Chat Recipient') {
            newDisplayName = 'My Notes';
            console.log(`   📝 One-way chat → "My Notes"`);
            shouldUpdate = true;
          } else if (chat.displayName && 
                     chat.displayName !== '(Direct Message)' && 
                     !chat.displayName.includes('spaces/')) {
            // Keep existing meaningful name
            console.log(`   ℹ️ Keeping existing meaningful name: "${chat.displayName}"`);
          }
        }

      } else if (chat.spaceType === 'SPACE') {
        console.log(`   👥 Processing Group/Space chat...`);
        
        // For groups, ensure current user is in participants
        const hasCurrentUser = chat.participants?.some(p => p.email === account.email);
        if (!hasCurrentUser) {
          newParticipants.push({
            userId: 'users/108506371856200018714',
            email: account.email,
            displayName: 'naveendev',
            type: 'HUMAN'
          });
          shouldUpdate = true;
          console.log(`   ➕ Added current user to group participants`);
        }
        
        // Keep existing display name for groups
        console.log(`   ℹ️ Keeping group name: "${chat.displayName}"`);
      }

      // Update the chat if needed
      if (shouldUpdate) {
        const updateData = {
          displayName: newDisplayName,
          participants: newParticipants
        };
        
        if (updatedMessages.length > 0) {
          updateData.messages = updatedMessages;
        }

        const updateResult = await Chat.updateOne(
          { _id: chat._id },
          { $set: updateData }
        );

        if (updateResult.modifiedCount > 0) {
          console.log(`   ✅ Updated: "${newDisplayName}" with ${newParticipants.length} participant(s)`);
          if (updatedMessages.length > 0) {
            console.log(`   📨 Enhanced ${updatedMessages.length} messages with participant info`);
          }
          updatedCount++;
        } else {
          console.log(`   ❌ Failed to update`);
        }
      } else {
        console.log(`   ℹ️ No changes needed`);
      }
      console.log('');
    }

    console.log(`\n🎯 COMPREHENSIVE FIX SUMMARY:`);
    console.log(`   Updated ${updatedCount} out of ${chats.length} chats`);
    console.log(`   ✅ Added participant info to messages for recipient identification`);
    console.log(`   ✅ Prioritized participants array over message analysis`);
    console.log(`   ✅ Handled both internal workspace and external users`);
    console.log(`   ✅ Enhanced fallback logic for one-way conversations`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

fixChatNamesComprehensive();
