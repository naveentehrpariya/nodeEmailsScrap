require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function fixChatNamesAndRecipients() {
  try {
    console.log('🔧 FIXING CHAT NAMES AND IDENTIFYING RECIPIENTS');
    console.log('='.repeat(60));

    await mongoose.connect(process.env.DB_URL_OFFICE || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Get all accounts
    const accounts = await Account.find({}).lean();
    console.log(`📊 Found ${accounts.length} accounts`);

    for (const account of accounts) {
      console.log(`\n👤 Processing account: ${account.email}`);
      
      // Get chats for this account
      const chats = await Chat.find({ account: account._id }).lean();
      console.log(`   Found ${chats.length} chats`);

      for (const chat of chats) {
        console.log(`\n   🔍 Analyzing chat: "${chat.displayName || chat.spaceId}"`);
        console.log(`      Space ID: ${chat.spaceId}`);
        console.log(`      Type: ${chat.spaceType}`);
        console.log(`      Messages: ${chat.messages?.length || 0}`);

        let chatModified = false;
        let newParticipants = [...(chat.participants || [])];
        let newDisplayName = chat.displayName;

        // For DIRECT_MESSAGE chats, try to identify the other participant
        if (chat.spaceType === 'DIRECT_MESSAGE' && chat.messages && chat.messages.length > 0) {
          console.log(`      📨 Analyzing ${chat.messages.length} messages for recipient clues...`);

          // Collect all unique sender IDs and emails
          const messageSenders = new Set();
          const senderEmails = new Set();
          
          for (const message of chat.messages) {
            if (message.senderId) {
              messageSenders.add(message.senderId.replace('users/', ''));
            }
            if (message.senderEmail) {
              senderEmails.add(message.senderEmail);
            }
          }

          console.log(`      🔍 Found message senders: ${Array.from(messageSenders).join(', ')}`);
          console.log(`      📧 Found sender emails: ${Array.from(senderEmails).join(', ')}`);

          // Try to identify the other party (not the current account holder)
          const otherSenders = Array.from(senderEmails).filter(email => email !== account.email);
          
          if (otherSenders.length > 0) {
            const otherParticipantEmail = otherSenders[0];
            console.log(`      👥 Identified other participant: ${otherParticipantEmail}`);

            // Look up this participant in UserMapping
            let otherParticipant = await UserMapping.findOne({ 
              email: otherParticipantEmail 
            }).lean();

            if (!otherParticipant) {
              // Try by userId
              const otherSenderIds = Array.from(messageSenders).filter(senderId => {
                return !messageSenders.has(account.email.split('@')[0]);
              });
              
              if (otherSenderIds.length > 0) {
                otherParticipant = await UserMapping.findOne({ 
                  userId: { $in: [otherSenderIds[0], `users/${otherSenderIds[0]}`] }
                }).lean();
              }
            }

            if (otherParticipant) {
              console.log(`      ✅ Found UserMapping: ${otherParticipant.displayName} (${otherParticipant.email})`);
              
              // Update display name to the other participant's name
              if (chat.displayName !== otherParticipant.displayName) {
                newDisplayName = otherParticipant.displayName;
                console.log(`      📝 Updated chat name: "${chat.displayName}" → "${newDisplayName}"`);
                chatModified = true;
              }

              // Ensure participants array includes both parties
              const participantNames = [account.email.split('@')[0]]; // Current user
              if (!participantNames.includes(otherParticipant.displayName)) {
                participantNames.push(otherParticipant.displayName);
              }
              newParticipants = participantNames;

            } else {
              console.log(`      ❌ No UserMapping found for: ${otherParticipantEmail}`);
              
              // Create a fallback name
              const fallbackName = otherParticipantEmail.split('@')[0];
              if (chat.displayName !== fallbackName && chat.displayName.includes('Chat Recipient')) {
                newDisplayName = fallbackName;
                console.log(`      📝 Using fallback name: "${chat.displayName}" → "${newDisplayName}"`);
                chatModified = true;
              }
            }
          } else {
            console.log(`      ⚠️ No other participants found - might be a self-conversation`);
            
            // For self-conversations or one-way chats, use a descriptive name
            if (chat.displayName && chat.displayName.includes('Chat Recipient')) {
              newDisplayName = 'Personal Notes';
              console.log(`      📝 Updated self-chat name: "${chat.displayName}" → "${newDisplayName}"`);
              chatModified = true;
            }
          }
        }

        // For SPACE (group) chats, keep existing displayName if it's meaningful
        if (chat.spaceType === 'SPACE' && chat.displayName && !chat.displayName.includes('spaces/')) {
          console.log(`      ℹ️ Group chat with name: ${chat.displayName} - keeping as is`);
        }

        // Update the chat if we made changes
        if (chatModified) {
          const updateResult = await Chat.updateOne(
            { _id: chat._id },
            { 
              $set: { 
                displayName: newDisplayName,
                participants: newParticipants
              } 
            }
          );

          if (updateResult.modifiedCount > 0) {
            console.log(`      ✅ Updated chat: "${newDisplayName}" with ${newParticipants.length} participants`);
          } else {
            console.log(`      ❌ Failed to update chat`);
          }
        }
      }
    }

    console.log('\n🎯 SUMMARY OF CURRENT USERMAPPING ENTRIES:');
    console.log('-'.repeat(50));
    
    const allUserMappings = await UserMapping.find({}).lean();
    console.log(`Total UserMapping entries: ${allUserMappings.length}`);
    
    // Show relevant mappings
    const relevantMappings = allUserMappings.filter(mapping => 
      mapping.email && (
        mapping.email.includes('@crossmilescarrier.com') ||
        mapping.displayName.includes('naveendev') ||
        mapping.displayName.includes('narender') ||
        mapping.displayName.includes('Ravi')
      )
    );

    console.log(`\nRelevant UserMappings for chat participants:`);
    for (const mapping of relevantMappings) {
      console.log(`• "${mapping.displayName}" <${mapping.email}> [${mapping.userId}]`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

fixChatNamesAndRecipients();
