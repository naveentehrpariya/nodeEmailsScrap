const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function checkMissingChatsAtlas() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://naveenfp:naveenfp@cluster0.5c8ne.mongodb.net/emails');
    console.log('✅ Connected to MongoDB Atlas');
    
    console.log('\n🔍 CHECKING FOR NARENDER AND DISPATCH ACCOUNTS IN ATLAS:');
    console.log('='.repeat(70));
    
    // Find all accounts
    const allAccounts = await Account.find({}).lean();
    console.log(`📊 Found ${allAccounts.length} total accounts in Atlas:`);
    
    allAccounts.forEach(account => {
      console.log(`   📧 ${account.email} (ID: ${account._id})`);
    });
    
    let narenderAccount = null;
    let dispatchAccount = null;
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    
    // Look for narender and dispatch accounts
    for (const account of allAccounts) {
      if (account.email.toLowerCase().includes('narender')) {
        narenderAccount = account;
        console.log(`   🎯 NARENDER ACCOUNT FOUND: ${account.email}`);
      }
      
      if (account.email.toLowerCase().includes('dispatch')) {
        dispatchAccount = account;
        console.log(`   🎯 DISPATCH ACCOUNT FOUND: ${account.email}`);
      }
    }
    
    if (!naveendevAccount) {
      console.log('❌ Naveendev account not found!');
      return;
    }
    
    console.log(`\n👤 NAVEENDEV ACCOUNT: ${naveendevAccount.email}`);
    const naveendevChats = await Chat.find({ account: naveendevAccount._id }).lean();
    console.log(`   📝 Current chats: ${naveendevChats.length}`);
    
    naveendevChats.forEach((chat, index) => {
      console.log(`      ${index + 1}. ${chat.displayName} (${chat.spaceType}) - ${chat.messages.length} messages`);
    });
    
    // Check narender account if exists
    if (narenderAccount) {
      console.log(`\n👤 NARENDER ACCOUNT FOUND: ${narenderAccount.email}`);
      const narenderChats = await Chat.find({ account: narenderAccount._id }).lean();
      console.log(`   📝 Chats in narender account: ${narenderChats.length}`);
      
      // Look for chats with naveendev
      for (const chat of narenderChats) {
        let hasNaveendev = false;
        
        for (const message of chat.messages) {
          if (message.senderEmail && 
              (message.senderEmail.toLowerCase().includes('naveendev') || 
               message.senderEmail === 'naveendev@crossmilescarrier.com')) {
            hasNaveendev = true;
            break;
          }
        }
        
        if (hasNaveendev) {
          console.log(`   🎯 FOUND CHAT WITH NAVEENDEV: ${chat.displayName}`);
          console.log(`      Space ID: ${chat.spaceId}`);
          console.log(`      Messages: ${chat.messages.length}`);
          console.log(`      Last message: ${chat.lastMessageTime}`);
          
          // Check if this chat exists in naveendev's account
          const existsInNaveendev = naveendevChats.some(nc => nc.spaceId === chat.spaceId);
          console.log(`      Exists in naveendev account: ${existsInNaveendev ? 'YES' : 'NO'}`);
          
          if (!existsInNaveendev) {
            console.log(`      ❌ MISSING FROM NAVEENDEV ACCOUNT!`);
          }
        }
      }
    } else {
      console.log('\n❌ NARENDER ACCOUNT NOT FOUND IN DATABASE');
      
      // Search for narender in Google Directory
      console.log('🔍 Searching Google Directory for narender users...');
      
      try {
        const auth = new google.auth.JWT(
          keys.client_email,
          null,
          keys.private_key,
          ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
          'dispatch@crossmilescarrier.com' // Use dispatch for admin access
        );
        
        const admin = google.admin({ version: "directory_v1", auth });
        
        // Try different search patterns for narender
        const searchQueries = [
          'name:narender*',
          'name:naren*', 
          'email:narender*',
          'email:naren*'
        ];
        
        for (const query of searchQueries) {
          try {
            console.log(`   Searching with query: ${query}`);
            const searchResults = await admin.users.list({
              customer: 'my_customer',
              query: query,
              maxResults: 10
            });
            
            const users = searchResults.data.users || [];
            console.log(`   Found ${users.length} users:`);
            
            users.forEach(user => {
              console.log(`      👤 ${user.name?.fullName || 'No name'} (${user.primaryEmail})`);
              console.log(`         ID: ${user.id}`);
              console.log(`         Active: ${!user.suspended}`);
            });
            
          } catch (searchError) {
            console.log(`   ❌ Search failed for ${query}: ${searchError.message}`);
          }
        }
        
      } catch (authError) {
        console.log(`❌ Directory access failed: ${authError.message}`);
      }
    }
    
    // Check dispatch account if exists
    if (dispatchAccount) {
      console.log(`\n📧 DISPATCH ACCOUNT FOUND: ${dispatchAccount.email}`);
      const dispatchChats = await Chat.find({ account: dispatchAccount._id }).lean();
      console.log(`   📝 Chats in dispatch account: ${dispatchChats.length}`);
      
      if (dispatchChats.length === 0) {
        console.log('   ⚠️ No chats synced for dispatch account - need to sync!');
      }
      
      // Look for chats with naveendev
      for (const chat of dispatchChats) {
        let hasNaveendev = false;
        
        for (const message of chat.messages) {
          if (message.senderEmail && 
              (message.senderEmail.toLowerCase().includes('naveendev') || 
               message.senderEmail === 'naveendev@crossmilescarrier.com')) {
            hasNaveendev = true;
            break;
          }
        }
        
        if (hasNaveendev) {
          console.log(`   🎯 FOUND CHAT WITH NAVEENDEV: ${chat.displayName}`);
          console.log(`      Space ID: ${chat.spaceId}`);
          console.log(`      Messages: ${chat.messages.length}`);
          console.log(`      Last message: ${chat.lastMessageTime}`);
          
          // Check if this chat exists in naveendev's account
          const existsInNaveendev = naveendevChats.some(nc => nc.spaceId === chat.spaceId);
          console.log(`      Exists in naveendev account: ${existsInNaveendev ? 'YES' : 'NO'}`);
          
          if (!existsInNaveendev) {
            console.log(`      ❌ MISSING FROM NAVEENDEV ACCOUNT!`);
          }
        }
      }
    } else {
      console.log('\n❌ DISPATCH ACCOUNT NOT FOUND IN DATABASE');
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('='.repeat(40));
    
    if (!narenderAccount) {
      console.log('1. 👤 ADD NARENDER ACCOUNT to the system');
      console.log('   - First find the correct narender email from Google Directory');
      console.log('   - Add it as an account in your system');
      console.log('   - Sync chats for narender account');
    }
    
    if (dispatchAccount && dispatchChats.length === 0) {
      console.log('2. 📧 SYNC DISPATCH ACCOUNT chats');
      console.log('   - Run chat sync for dispatch@crossmilescarrier.com');
      console.log('   - This will reveal chats with naveendev');
    }
    
    console.log('3. 🔄 IMPLEMENT BIDIRECTIONAL SYNC');
    console.log('   - Copy missing chats from narender/dispatch to naveendev');
    console.log('   - Ensure all participants see all their conversations');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

checkMissingChatsAtlas();
