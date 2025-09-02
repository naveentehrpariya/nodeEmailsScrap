require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');

async function fixTestMessageChat() {
  try {
    console.log('🔧 FIXING THE TEST MESSAGE CHAT');
    console.log('='.repeat(50));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Find naveendev account and the test message chat
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const testChat = await Chat.findOne({ 
      account: naveendevAccount._id, 
      spaceId: 'spaces/2pUolCAAAAE' 
    });
    
    console.log('🎯 Found test message chat:');
    console.log(`   Messages: ${testChat.messages.length}`);
    console.log(`   Participants: ${testChat.participants.length}`);
    console.log(`   Display: "${testChat.displayName}"`);
    
    if (testChat.messages.length > 0) {
      console.log(`   Message: "${testChat.messages[0].text}"`);
      console.log(`   From: ${testChat.messages[0].senderEmail}`);
    }
    
    // Since this is a one-sided conversation (only your message), 
    // we need to infer who you intended to send it to.
    // For now, let's create a generic "unknown recipient" participant
    // that will allow the chat to appear in the API
    
    console.log('\n🔧 Adding generic participant...');
    
    const genericParticipant = {
      userId: 'users/unknown_recipient',
      email: 'unknown@crossmilescarrier.com',
      displayName: 'Test Recipient',
      type: 'HUMAN'
    };
    
    const updateResult = await Chat.updateOne(
      { _id: testChat._id },
      { 
        $set: { 
          participants: [genericParticipant],
          displayName: 'Test Recipient'
        } 
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      console.log('✅ Successfully added participant to test chat');
      console.log('   This chat should now appear in the API');
    } else {
      console.log('❌ Failed to update chat');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

fixTestMessageChat();
