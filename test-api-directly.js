require('dotenv').config();
const mongoose = require('mongoose');
const ChatController = require('./controllers/chatController');

async function testApiDirectly() {
  try {
    console.log('🧪 TESTING CHATCONTROLLER.GETACCOUNTCHATS DIRECTLY');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // Mock request and response objects
    const req = {
      params: { accountEmail: 'naveendev@crossmilescarrier.com' },
      query: { page: 1, limit: 20 }
    };
    
    let responseData = null;
    let statusCode = 200;
    
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      }
    };
    
    console.log('🔄 Calling ChatController.getAccountChats...');
    
    // Call the actual controller method
    await ChatController.getAccountChats(req, res);
    
    console.log(`📊 Response Status: ${statusCode}`);
    
    if (responseData && responseData.data && responseData.data.chats) {
      console.log(`📋 Total chats returned: ${responseData.data.chats.length}`);
      
      // Check if our target chats are present
      const narenderChat = responseData.data.chats.find(c => 
        c.title.toLowerCase().includes('narender')
      );
      
      const dispatchChat = responseData.data.chats.find(c => 
        c.title.toLowerCase().includes('dispatch') || 
        c.title.toLowerCase().includes('miles') ||
        c.title.toLowerCase().includes('cross')
      );
      
      console.log(`🎯 Narender chat found: ${narenderChat ? '✅ YES' : '❌ NO'}`);
      if (narenderChat) {
        console.log(`   Title: "${narenderChat.title}"`);
        console.log(`   Messages: ${narenderChat.messageCount}`);
        console.log(`   Space Type: ${narenderChat.spaceType}`);
      }
      
      console.log(`🎯 Dispatch chat found: ${dispatchChat ? '✅ YES' : '❌ NO'}`);
      if (dispatchChat) {
        console.log(`   Title: "${dispatchChat.title}"`);
        console.log(`   Messages: ${dispatchChat.messageCount}`);
        console.log(`   Space Type: ${dispatchChat.spaceType}`);
      }
      
      console.log(`\n📋 All chats returned:`);
      responseData.data.chats.forEach((chat, i) => {
        console.log(`   ${i + 1}. "${chat.title}" (${chat.spaceType}) - ${chat.messageCount} messages`);
      });
      
      if (narenderChat && dispatchChat) {
        console.log('\n🎉 SUCCESS: Both target chats are now showing in the API!');
        console.log('✅ The fix is working correctly.');
      } else {
        console.log('\n⚠️ ISSUE PERSISTS: One or both target chats are still missing.');
        console.log('❓ This suggests the API filtering logic still has issues or');
        console.log('   there might be additional filtering steps we haven\'t identified.');
      }
    } else {
      console.log('❌ Unexpected response format or error');
      console.log('Response:', JSON.stringify(responseData, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

testApiDirectly();
