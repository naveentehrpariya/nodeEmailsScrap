require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function verifyDatabaseConnection() {
  try {
    console.log('🔍 VERIFYING DATABASE CONNECTION AND CURRENT STATE:');
    console.log('='.repeat(60));
    
    // Check environment variables
    console.log('📋 Environment Configuration:');
    console.log(`   DB_URL_OFFICE: ${process.env.DB_URL_OFFICE ? 'SET' : 'NOT SET'}`);
    if (process.env.DB_URL_OFFICE) {
      // Mask password for security
      const maskedUrl = process.env.DB_URL_OFFICE.replace(/:([^:@]*@)/, ':****@');
      console.log(`   Database URL: ${maskedUrl}`);
    }
    console.log('');
    
    // Connect using the same method as the application
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database using application configuration');
    
    // Check all accounts
    console.log('\n📊 CHECKING ALL ACCOUNTS:');
    const allAccounts = await Account.find({}).lean();
    console.log(`   Found ${allAccounts.length} accounts:`);
    
    allAccounts.forEach((account, index) => {
      console.log(`   ${index + 1}. ${account.email} (ID: ${account._id})`);
    });
    
    // Focus on naveendev account
    const naveendevAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!naveendevAccount) {
      console.log('\n❌ NAVEENDEV ACCOUNT NOT FOUND!');
      return;
    }
    
    console.log(`\n👤 NAVEENDEV ACCOUNT FOUND: ${naveendevAccount._id}`);
    
    // Get all chats for naveendev
    const chats = await Chat.find({ account: naveendevAccount._id }).lean();
    console.log(`📝 Total chats for naveendev: ${chats.length}`);
    
    if (chats.length === 0) {
      console.log('❌ NO CHATS FOUND FOR NAVEENDEV ACCOUNT!');
      console.log('   This suggests either:');
      console.log('   1. Chats were never synced');
      console.log('   2. Using wrong database');
      console.log('   3. Account ID mismatch');
      return;
    }
    
    // List all chats
    console.log('\n📋 ALL CHATS FOR NAVEENDEV:');
    chats.forEach((chat, index) => {
      console.log(`   ${index + 1}. "${chat.displayName}" (${chat.spaceType})`);
      console.log(`      Space ID: ${chat.spaceId}`);
      console.log(`      Messages: ${chat.messages.length}`);
      console.log(`      Participants: ${chat.participants.length}`);
      
      if (chat.participants.length > 0) {
        console.log(`      Participant details:`);
        chat.participants.forEach(p => {
          console.log(`        - ${p.displayName || 'no name'} (${p.email || 'no email'})`);
        });
      }
      
      // Check if this might be narender or dispatch chat
      const isNarenderChat = chat.spaceId === 'spaces/ilSNZCAAAAE';
      const isDispatchChat = chat.spaceId === 'spaces/w9y_pCAAAAE';
      
      if (isNarenderChat) {
        console.log(`      🎯 THIS IS THE NARENDER CHAT!`);
      }
      if (isDispatchChat) {
        console.log(`      🎯 THIS IS THE DISPATCH CHAT!`);
      }
      console.log('');
    });
    
    // Check specific chats we're looking for
    console.log('🔍 CHECKING FOR SPECIFIC CHATS:');
    
    const narenderChat = chats.find(c => c.spaceId === 'spaces/ilSNZCAAAAE');
    const dispatchChat = chats.find(c => c.spaceId === 'spaces/w9y_pCAAAAE');
    
    console.log(`   Narender chat (spaces/ilSNZCAAAAE): ${narenderChat ? 'FOUND' : 'NOT FOUND'}`);
    if (narenderChat) {
      console.log(`     - Display Name: "${narenderChat.displayName}"`);
      console.log(`     - Messages: ${narenderChat.messages.length}`);
      console.log(`     - Participants: ${narenderChat.participants.length}`);
    }
    
    console.log(`   Dispatch chat (spaces/w9y_pCAAAAE): ${dispatchChat ? 'FOUND' : 'NOT FOUND'}`);
    if (dispatchChat) {
      console.log(`     - Display Name: "${dispatchChat.displayName}"`);
      console.log(`     - Messages: ${dispatchChat.messages.length}`);
      console.log(`     - Participants: ${dispatchChat.participants.length}`);
    }
    
    // Check other accounts for these chats
    console.log('\n🔍 CHECKING OTHER ACCOUNTS FOR THESE CHATS:');
    
    for (const otherAccount of allAccounts) {
      if (otherAccount.email === 'naveendev@crossmilescarrier.com') continue;
      
      const otherChats = await Chat.find({ account: otherAccount._id }).lean();
      const hasNarenderChat = otherChats.some(c => c.spaceId === 'spaces/ilSNZCAAAAE');
      const hasDispatchChat = otherChats.some(c => c.spaceId === 'spaces/w9y_pCAAAAE');
      
      if (hasNarenderChat || hasDispatchChat) {
        console.log(`   ${otherAccount.email}:`);
        console.log(`     - Has narender chat: ${hasNarenderChat}`);
        console.log(`     - Has dispatch chat: ${hasDispatchChat}`);
      }
    }
    
    // Check UserMappings
    console.log('\n👥 CHECKING USER MAPPINGS:');
    const totalMappings = await UserMapping.countDocuments();
    console.log(`   Total UserMappings: ${totalMappings}`);
    
    const narenderMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'narender', $options: 'i' } },
        { displayName: { $regex: 'narender', $options: 'i' } }
      ]
    }).lean();
    
    const dispatchMappings = await UserMapping.find({
      $or: [
        { email: { $regex: 'dispatch', $options: 'i' } },
        { displayName: { $regex: 'dispatch', $options: 'i' } }
      ]
    }).lean();
    
    console.log(`   Narender mappings: ${narenderMappings.length}`);
    narenderMappings.forEach(m => {
      console.log(`     - ${m.displayName} (${m.email}) - ${m.userId}`);
    });
    
    console.log(`   Dispatch mappings: ${dispatchMappings.length}`);
    dispatchMappings.forEach(m => {
      console.log(`     - ${m.displayName} (${m.email}) - ${m.userId}`);
    });
    
    // Final diagnosis
    console.log('\n🎯 DIAGNOSIS:');
    if (!narenderChat && !dispatchChat) {
      console.log('❌ NEITHER NARENDER NOR DISPATCH CHATS EXIST IN NAVEENDEV ACCOUNT');
      console.log('   This means:');
      console.log('   1. These chats were never synced to naveendev account');
      console.log('   2. They may exist in their respective accounts only');
      console.log('   3. We need to copy them from narender/dispatch accounts to naveendev');
    } else if (!narenderChat) {
      console.log('❌ NARENDER CHAT MISSING from naveendev account');
    } else if (!dispatchChat) {
      console.log('❌ DISPATCH CHAT MISSING from naveendev account');
    } else {
      console.log('✅ BOTH CHATS EXIST - The issue might be in API filtering logic');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

verifyDatabaseConnection();
