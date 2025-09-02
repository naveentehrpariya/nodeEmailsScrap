const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function syncDispatchAndFindNarender() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    // First, let's sync the dispatch account to see what chats it has
    console.log('\n🔄 SYNCING DISPATCH ACCOUNT CHATS:');
    console.log('='.repeat(50));
    
    const dispatchAccount = await Account.findOne({ email: 'dispatch@crossmilescarrier.com' });
    if (!dispatchAccount) {
      console.log('❌ Dispatch account not found');
      return;
    }
    
    console.log(`📧 Found dispatch account: ${dispatchAccount.email}`);
    
    // Setup Google Chat API for dispatch account
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
      dispatchAccount.email
    );

    const chat = google.chat({ version: "v1", auth });
    const admin = google.admin({ version: "directory_v1", auth });
    
    try {
      console.log('📡 Fetching spaces for dispatch account...');
      const spaceRes = await chat.spaces.list();
      const spaces = spaceRes.data.spaces || [];
      
      console.log(`📊 Found ${spaces.length} spaces for dispatch account`);
      
      let foundNaveendevChats = 0;
      let foundNarenderChats = 0;
      
      for (const space of spaces) {
        console.log(`\n📝 Space: ${space.displayName || '(unnamed)'} (${space.spaceType}) - ${space.name}`);
        
        try {
          // Get messages to find participants
          const messageRes = await chat.spaces.messages.list({
            parent: space.name,
            pageSize: 20
          });
          
          const messages = messageRes.data.messages || [];
          console.log(`   📨 ${messages.length} messages found`);
          
          if (messages.length > 0) {
            const participants = new Set();
            let hasNaveendev = false;
            let hasNarender = false;
            
            messages.forEach(msg => {
              if (msg.sender) {
                const senderEmail = (msg.sender.email || '').toLowerCase();
                const senderName = (msg.sender.displayName || '').toLowerCase();
                
                participants.add(msg.sender.email || 'unknown');
                
                if (senderEmail.includes('naveendev') || senderName.includes('naveen')) {
                  hasNaveendev = true;
                }
                
                if (senderEmail.includes('narender') || senderName.includes('narender') || senderName.includes('naren')) {
                  hasNarender = true;
                }
              }
            });
            
            console.log(`   👥 Participants: ${Array.from(participants).join(', ')}`);
            console.log(`   🎯 Has naveendev: ${hasNaveendev ? 'YES' : 'NO'}`);
            console.log(`   🎯 Has narender: ${hasNarender ? 'YES' : 'NO'}`);
            
            if (hasNaveendev) {
              foundNaveendevChats++;
              console.log(`   ✅ FOUND CHAT WITH NAVEENDEV!`);
            }
            
            if (hasNarender) {
              foundNarenderChats++;
              console.log(`   ✅ FOUND CHAT WITH NARENDER!`);
            }
          }
        } catch (msgError) {
          console.log(`   ❌ Could not get messages: ${msgError.message}`);
        }
      }
      
      console.log(`\n📊 Summary for dispatch account:`);
      console.log(`   - Chats with naveendev: ${foundNaveendevChats}`);
      console.log(`   - Chats with narender: ${foundNarenderChats}`);
      
      if (foundNaveendevChats > 0 || foundNarenderChats > 0) {
        console.log('\n🔄 SYNCING DISPATCH CHATS TO DATABASE...');
        
        // Now let's actually sync these chats
        let syncedChatsCount = 0;
        let syncedMessagesCount = 0;
        
        for (const space of spaces) {
          try {
            const spaceId = space.name;
            const spaceType = space.spaceType;
            const displayName = space.displayName || 
                (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");

            // Fetch messages for this space
            const messageRes = await chat.spaces.messages.list({
              parent: spaceId,
              pageSize: 100,
            });

            const rawMessages = messageRes.data.messages || [];
            const messages = [];

            // Process messages
            for (const m of rawMessages) {
              const senderId = m.sender?.name || "Unknown";
              
              // Simple sender info (we'll resolve later)
              const senderInfo = {
                email: m.sender?.email || `${senderId}@unknown`,
                displayName: m.sender?.displayName || senderId.split('/').pop() || 'Unknown',
                domain: 'crossmilescarrier.com'
              };
              
              const isExternal = !senderInfo.email.endsWith('@crossmilescarrier.com');
              const isSentByCurrentUser = senderInfo.email === dispatchAccount.email;

              messages.push({
                messageId: m.name,
                text: m.text || "(no text)",
                senderId,
                senderEmail: senderInfo.email,
                senderDisplayName: senderInfo.displayName,
                senderDomain: senderInfo.domain,
                attachments: [], // We'll handle attachments later
                isSentByCurrentUser,
                isExternal,
                createTime: new Date(m.createTime),
              });
            }

            // Find or create chat
            let chatDoc = await Chat.findOne({ spaceId, account: dispatchAccount._id });
            
            if (chatDoc) {
              // Update existing chat
              const existingMessageIds = new Set(chatDoc.messages.map(msg => msg.messageId));
              const newMessages = messages.filter(msg => !existingMessageIds.has(msg.messageId));
              
              if (newMessages.length > 0) {
                chatDoc.messages.push(...newMessages);
                syncedMessagesCount += newMessages.length;
              }
              
              chatDoc.messageCount = chatDoc.messages.length;
              chatDoc.lastMessageTime = messages.length > 0 ? 
                new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                chatDoc.lastMessageTime;
              
              await chatDoc.save();
              console.log(`✅ Updated chat ${spaceId}: ${newMessages.length} new messages`);
              
            } else {
              // Create new chat
              chatDoc = new Chat({
                account: dispatchAccount._id,
                spaceId,
                displayName,
                spaceType,
                participants: [],
                messages,
                messageCount: messages.length,
                lastMessageTime: messages.length > 0 ? 
                  new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                  new Date()
              });

              await chatDoc.save();
              syncedChatsCount++;
              syncedMessagesCount += messages.length;
              
              console.log(`✅ Created chat ${spaceId}: ${messages.length} messages`);
            }

          } catch (spaceError) {
            console.error(`❌ Error syncing space ${space.name}: ${spaceError.message}`);
          }
        }
        
        console.log(`\n📊 Sync Results:`);
        console.log(`   - Synced chats: ${syncedChatsCount}`);
        console.log(`   - Synced messages: ${syncedMessagesCount}`);
        
        // Update account last sync time
        dispatchAccount.lastChatSync = new Date();
        await dispatchAccount.save();
      }
      
    } catch (apiError) {
      console.error(`❌ Google Chat API error: ${apiError.message}`);
    }
    
    // Now look for narender account in Google Directory
    console.log('\n🔍 SEARCHING FOR NARENDER IN GOOGLE DIRECTORY:');
    console.log('='.repeat(50));
    
    try {
      // Use dispatch account auth to search directory
      const searchResults = await admin.users.list({
        customer: 'my_customer',
        query: 'name:narender*',
        maxResults: 20
      });
      
      const users = searchResults.data.users || [];
      console.log(`📊 Found ${users.length} users matching 'narender':`);
      
      users.forEach(user => {
        console.log(`   👤 ${user.name?.fullName || 'No name'} (${user.primaryEmail}) - ID: ${user.id}`);
        
        // Check if we have this account in our system
        const existsInDb = Account.findOne({ email: user.primaryEmail });
        console.log(`      Database: ${existsInDb ? 'EXISTS' : 'MISSING'}`);
      });
      
      if (users.length > 0) {
        console.log('\n💡 RECOMMENDATION:');
        console.log('Add the narender account to your system and sync its chats.');
        console.log('This will likely reveal the missing chats with naveendev.');
      }
      
    } catch (searchError) {
      console.log(`❌ Directory search failed: ${searchError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

syncDispatchAndFindNarender();
