require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

// Use the same connection as the running application
const connectDB = require('./db/config');

async function debugProblemChats() {
  try {
    await connectDB();
    console.log('Connected to database');
    
    // Find account
    const account = await Account.findOne({ email: { $regex: 'naveen', $options: 'i' } });
    if (!account) {
      console.log('No naveen account found');
      process.exit(1);
    }
    console.log(`Using account: ${account.email}`);
    
    // Get the problematic direct message chats
    const problematicSpaceIds = [
      'spaces/w9y_pCAAAAE', 
      'spaces/2pUolCAAAAE', 
      'spaces/ilSNZCAAAAE'
    ];
    
    const problematicChats = await Chat.find({ 
      account: account._id, 
      spaceId: { $in: problematicSpaceIds }
    }).lean();
    
    console.log(`\nFound ${problematicChats.length} problematic chats:`);
    
    problematicChats.forEach((chat, i) => {
      console.log(`\nChat ${i+1}: "${chat.displayName}"`);
      console.log(`  spaceId: ${chat.spaceId}`);
      console.log(`  participants: ${chat.participants?.length || 0}`);
      console.log(`  messages: ${chat.messages?.length || 0}`);
      
      if (chat.participants && chat.participants.length > 0) {
        console.log(`  Participant details:`);
        chat.participants.forEach((p, j) => {
          console.log(`    ${j+1}. displayName: "${p.displayName}"`);
          console.log(`       email: "${p.email}"`);
          console.log(`       userId: "${p.userId}"`);
        });
      }
      
      if (chat.messages && chat.messages.length > 0) {
        console.log(`  Message details (first 3):`);
        chat.messages.slice(0, 3).forEach((msg, j) => {
          console.log(`    Message ${j+1}:`);
          console.log(`      senderId: "${msg.senderId}"`);
          console.log(`      senderEmail: "${msg.senderEmail}"`);
          console.log(`      senderDisplayName: "${msg.senderDisplayName}"`);
          console.log(`      isSentByCurrentUser: ${msg.isSentByCurrentUser}`);
          console.log(`      text: "${msg.text?.substring(0, 50)}..."`);
        });
      }
    });
    
    // Now let's try to fix these chats by running the participant fix function
    console.log('\n🔧 Attempting to fix incomplete participants...');
    
    // Import ChatController
    const ChatController = require('./controllers/chatController');
    
    // Mock request and response
    const req = {};
    const res = {
      json: (data) => {
        console.log('✅ Fix completed:');
        console.log(JSON.stringify(data, null, 2));
        
        // Test the chats again
        setTimeout(async () => {
          console.log('\n🔍 Testing chats after fix...');
          const fixedChats = await Chat.find({ 
            account: account._id, 
            spaceId: { $in: problematicSpaceIds }
          }).lean();
          
          fixedChats.forEach((chat, i) => {
            console.log(`\nFixed Chat ${i+1}: "${chat.displayName}"`);
            console.log(`  participants: ${chat.participants?.length || 0}`);
            if (chat.participants && chat.participants.length > 0) {
              chat.participants.forEach((p, j) => {
                console.log(`    ${j+1}. ${p.displayName} (${p.email})`);
              });
            }
          });
          
          process.exit(0);
        }, 1000);
      },
      status: (code) => ({
        json: (data) => {
          console.error(`❌ Fix failed with status ${code}:`, data);
          process.exit(1);
        }
      })
    };
    
    await ChatController.fixIncompleteParticipants(req, res);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugProblemChats();
