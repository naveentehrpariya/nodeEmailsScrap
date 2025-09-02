const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function examineDirectMessageParticipants() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
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
    const admin = google.admin({ version: "directory_v1", auth });
    
    console.log('\n🔍 EXAMINING ALL DIRECT MESSAGE PARTICIPANTS:');
    console.log('='.repeat(60));
    
    const spaceRes = await chat.spaces.list();
    const spaces = spaceRes.data.spaces || [];
    const directMessages = spaces.filter(space => space.spaceType === 'DIRECT_MESSAGE');
    
    console.log(`📊 Found ${directMessages.length} Direct Message spaces`);
    
    for (const space of directMessages) {
      console.log(`\n📝 Examining space: ${space.name}`);
      
      try {
        // Get messages to find participants
        const messageRes = await chat.spaces.messages.list({
          parent: space.name,
          pageSize: 20
        });
        
        const messages = messageRes.data.messages || [];
        console.log(`   📨 ${messages.length} messages found`);
        
        if (messages.length > 0) {
          const participants = new Map();
          
          // Collect all unique senders
          messages.forEach(msg => {
            if (msg.sender && msg.sender.name) {
              const senderId = msg.sender.name;
              if (!participants.has(senderId)) {
                participants.set(senderId, {
                  name: msg.sender.displayName || 'Unknown',
                  email: msg.sender.email || 'unknown@domain.com',
                  count: 0
                });
              }
              participants.get(senderId).count++;
            }
          });
          
          console.log(`   👥 Participants (${participants.size}):`);
          for (const [senderId, info] of participants.entries()) {
            console.log(`     • ${senderId}: ${info.name} (${info.email}) - ${info.count} messages`);
            
            // Check if this could be dispatch or narender
            const name = info.name.toLowerCase();
            const email = info.email.toLowerCase();
            
            if (name.includes('dispatch') || email.includes('dispatch')) {
              console.log(`       🎯 DISPATCH FOUND! Name: ${info.name}, Email: ${info.email}`);
            }
            if (name.includes('narender') || email.includes('narender')) {
              console.log(`       🎯 NARENDER FOUND! Name: ${info.name}, Email: ${info.email}`);
            }
            
            // Try to resolve full user details from Google Directory
            if (senderId.startsWith('users/')) {
              try {
                const userId = senderId.split('/')[1];
                const userRes = await admin.users.get({ userKey: userId });
                const userData = userRes.data;
                
                console.log(`       📋 Full details: ${userData.name?.fullName} (${userData.primaryEmail})`);
                
                // Check full details for dispatch/narender
                const fullName = (userData.name?.fullName || '').toLowerCase();
                const primaryEmail = (userData.primaryEmail || '').toLowerCase();
                
                if (fullName.includes('dispatch') || primaryEmail.includes('dispatch')) {
                  console.log(`       🎯 DISPATCH FOUND IN FULL DETAILS! Name: ${userData.name?.fullName}, Email: ${userData.primaryEmail}`);
                }
                if (fullName.includes('narender') || primaryEmail.includes('narender')) {
                  console.log(`       🎯 NARENDER FOUND IN FULL DETAILS! Name: ${userData.name?.fullName}, Email: ${userData.primaryEmail}`);
                }
                
              } catch (userError) {
                // Ignore user lookup errors
                console.log(`       ❌ Could not resolve user details: ${userError.message}`);
              }
            }
          }
        }
        
        // Also try to get space memberships directly
        try {
          console.log('   🔍 Getting space memberships...');
          const membersRes = await chat.spaces.members.list({ parent: space.name });
          const members = membersRes?.data?.memberships || [];
          
          console.log(`   👥 Direct memberships (${members.length}):`);
          for (const membership of members) {
            if (membership.member && membership.member.name) {
              const memberName = membership.member.name;
              console.log(`     • Member: ${memberName}`);
              
              // Try to resolve member details
              if (memberName.startsWith('users/')) {
                try {
                  const userId = memberName.split('/')[1];
                  const userRes = await admin.users.get({ userKey: userId });
                  const userData = userRes.data;
                  
                  console.log(`       📋 Member details: ${userData.name?.fullName} (${userData.primaryEmail})`);
                  
                  // Check for dispatch/narender in member details
                  const fullName = (userData.name?.fullName || '').toLowerCase();
                  const primaryEmail = (userData.primaryEmail || '').toLowerCase();
                  
                  if (fullName.includes('dispatch') || primaryEmail.includes('dispatch')) {
                    console.log(`       🎯 DISPATCH MEMBER FOUND! Name: ${userData.name?.fullName}, Email: ${userData.primaryEmail}`);
                  }
                  if (fullName.includes('narender') || primaryEmail.includes('narender')) {
                    console.log(`       🎯 NARENDER MEMBER FOUND! Name: ${userData.name?.fullName}, Email: ${userData.primaryEmail}`);
                  }
                  
                } catch (memberError) {
                  console.log(`       ❌ Could not resolve member: ${memberError.message}`);
                }
              }
            }
          }
        } catch (memberError) {
          console.log(`   ❌ Could not get memberships: ${memberError.message}`);
        }
        
      } catch (spaceError) {
        console.log(`   ❌ Error examining space: ${spaceError.message}`);
      }
    }
    
    // Also check if dispatch/narender accounts exist in Google Directory
    console.log('\n🔍 CHECKING GOOGLE DIRECTORY FOR DISPATCH/NARENDER USERS:');
    console.log('='.repeat(60));
    
    try {
      // Search for dispatch users
      console.log('📧 Searching for dispatch users...');
      const dispatchSearch = await admin.users.list({
        customer: 'my_customer',
        query: 'email:dispatch*',
        maxResults: 10
      });
      
      const dispatchUsers = dispatchSearch.data.users || [];
      console.log(`   Found ${dispatchUsers.length} dispatch users:`);
      dispatchUsers.forEach(user => {
        console.log(`     • ${user.name?.fullName} (${user.primaryEmail}) - ID: ${user.id}`);
      });
      
    } catch (searchError) {
      console.log(`❌ Directory search failed: ${searchError.message}`);
    }
    
    try {
      // Search for narender users
      console.log('\n👤 Searching for narender users...');
      const narenderSearch = await admin.users.list({
        customer: 'my_customer',
        query: 'name:narender*',
        maxResults: 10
      });
      
      const narenderUsers = narenderSearch.data.users || [];
      console.log(`   Found ${narenderUsers.length} narender users:`);
      narenderUsers.forEach(user => {
        console.log(`     • ${user.name?.fullName} (${user.primaryEmail}) - ID: ${user.id}`);
      });
      
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

examineDirectMessageParticipants();
