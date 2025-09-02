const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function checkAllAccountsAndSync() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    // 1. Check all accounts for dispatch/narender chats
    console.log('\n🔍 CHECKING ALL ACCOUNTS FOR DISPATCH/NARENDER CHATS:');
    console.log('='.repeat(70));
    
    const allAccounts = await Account.find({}).lean();
    console.log(`📊 Found ${allAccounts.length} accounts in database`);
    
    let foundInOtherAccount = false;
    
    for (const account of allAccounts) {
      console.log(`\n📧 Checking account: ${account.email}`);
      
      const chats = await Chat.find({ account: account._id }).lean();
      console.log(`   📝 ${chats.length} chats found`);
      
      // Search for dispatch/narender
      const dispatchChats = chats.filter(chat => 
        (chat.displayName && chat.displayName.toLowerCase().includes('dispatch')) ||
        chat.messages.some(message => 
          (message.senderEmail && message.senderEmail.toLowerCase().includes('dispatch')) ||
          (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('dispatch'))
        )
      );
      
      const narenderChats = chats.filter(chat => 
        (chat.displayName && chat.displayName.toLowerCase().includes('narender')) ||
        chat.messages.some(message => 
          (message.senderEmail && message.senderEmail.toLowerCase().includes('narender')) ||
          (message.senderDisplayName && message.senderDisplayName.toLowerCase().includes('narender'))
        )
      );
      
      if (dispatchChats.length > 0 || narenderChats.length > 0) {
        foundInOtherAccount = true;
        console.log(`   ✅ Found ${dispatchChats.length} dispatch chats and ${narenderChats.length} narender chats`);
        
        [...dispatchChats, ...narenderChats].forEach(chat => {
          console.log(`     - ${chat.displayName} (${chat.messages.length} messages)`);
        });
      }
    }
    
    if (!foundInOtherAccount) {
      console.log('❌ No dispatch or narender chats found in ANY account');
    }
    
    // 2. Check Google Chat API directly to see if these chats exist
    console.log('\n🔍 CHECKING GOOGLE CHAT API DIRECTLY:');
    console.log('='.repeat(50));
    
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    // Setup Google Chat API
    const SCOPES = [
      "https://www.googleapis.com/auth/chat.spaces.readonly",
      "https://www.googleapis.com/auth/chat.messages.readonly",
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ];

    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      SCOPES,
      account.email
    );

    const chat = google.chat({ version: "v1", auth });
    
    try {
      console.log('📡 Fetching spaces from Google Chat API...');
      const spaceRes = await chat.spaces.list();
      const spaces = spaceRes.data.spaces || [];
      
      console.log(`📊 Found ${spaces.length} spaces in Google Chat API`);
      
      // Look for dispatch/narender spaces
      let foundDispatch = false;
      let foundNarender = false;
      
      for (const space of spaces) {
        const displayName = space.displayName || '(unnamed)';
        const spaceType = space.spaceType;
        
        console.log(`📝 Space: ${displayName} (${spaceType}) - ${space.name}`);
        
        // Check if this space has dispatch or narender
        if (displayName.toLowerCase().includes('dispatch') || displayName.toLowerCase().includes('narender')) {
          console.log(`   🎯 POTENTIAL MATCH: ${displayName}`);
          
          if (displayName.toLowerCase().includes('dispatch')) foundDispatch = true;
          if (displayName.toLowerCase().includes('narender')) foundNarender = true;
          
          // Get messages to see participants
          try {
            const messageRes = await chat.spaces.messages.list({
              parent: space.name,
              pageSize: 10
            });
            
            const messages = messageRes.data.messages || [];
            console.log(`   📨 ${messages.length} messages found in this space`);
            
            if (messages.length > 0) {
              const senders = new Set();
              messages.forEach(msg => {
                if (msg.sender && msg.sender.displayName) {
                  senders.add(msg.sender.displayName);
                }
              });
              console.log(`   👥 Participants: ${Array.from(senders).join(', ')}`);
            }
          } catch (msgError) {
            console.log(`   ❌ Could not fetch messages: ${msgError.message}`);
          }
        }
        
        // For direct messages, check participants by fetching messages
        if (spaceType === 'DIRECT_MESSAGE') {
          try {
            const messageRes = await chat.spaces.messages.list({
              parent: space.name,
              pageSize: 5
            });
            
            const messages = messageRes.data.messages || [];
            let hasDispatch = false;
            let hasNarender = false;
            
            messages.forEach(msg => {
              if (msg.sender) {
                const senderName = (msg.sender.displayName || '').toLowerCase();
                const senderEmail = (msg.sender.email || '').toLowerCase();
                
                if (senderName.includes('dispatch') || senderEmail.includes('dispatch')) {
                  hasDispatch = true;
                }
                if (senderName.includes('narender') || senderEmail.includes('narender')) {
                  hasNarender = true;
                }
              }
            });
            
            if (hasDispatch || hasNarender) {
              console.log(`   🎯 DM with ${hasDispatch ? 'dispatch' : ''}${hasDispatch && hasNarender ? ' and ' : ''}${hasNarender ? 'narender' : ''}`);
              foundDispatch = foundDispatch || hasDispatch;
              foundNarender = foundNarender || hasNarender;
            }
          } catch (msgError) {
            // Skip silently for DMs we can't access
          }
        }
      }
      
      console.log(`\n📊 API Search Results:`);
      console.log(`   📧 Dispatch spaces found: ${foundDispatch ? 'YES' : 'NO'}`);
      console.log(`   👤 Narender spaces found: ${foundNarender ? 'YES' : 'NO'}`);
      
      if (foundDispatch || foundNarender) {
        console.log('\n🔄 MISSING CHATS FOUND IN GOOGLE API - NEED TO SYNC!');
        console.log('   The chats exist in Google Chat but are missing from our database.');
        console.log('   Running a fresh sync should retrieve them...');
        
        // Suggest running sync
        console.log('\n💡 RECOMMENDATION:');
        console.log('   Run a fresh chat sync for naveendev account to retrieve these chats.');
        console.log('   Command: curl -X POST http://localhost:3000/test/account/naveendev@crossmilescarrier.com/sync-chats');
      } else {
        console.log('\n❌ NO MATCHING CHATS FOUND IN GOOGLE API');
        console.log('   Either these chats were deleted, archived, or never existed for this account.');
      }
      
    } catch (apiError) {
      console.error(`❌ Google Chat API error: ${apiError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

checkAllAccountsAndSync();
