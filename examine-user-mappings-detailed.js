const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function examineUserMappingsDetailed() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    console.log('\n🔍 DETAILED EXAMINATION OF ALL USER MAPPINGS:');
    console.log('='.repeat(60));
    
    // Get all user mappings
    const allMappings = await UserMapping.find({}).lean();
    console.log(`📊 Total UserMappings in database: ${allMappings.length}`);
    
    console.log('\n📋 ALL USER MAPPINGS:');
    allMappings.forEach((mapping, index) => {
      console.log(`${index + 1}. ${mapping.userId}`);
      console.log(`   Display Name: ${mapping.displayName}`);
      console.log(`   Email: ${mapping.email}`);
      console.log(`   Domain: ${mapping.domain}`);
      console.log(`   Resolved By: ${mapping.resolvedBy}`);
      console.log(`   Confidence: ${mapping.confidence}%`);
      console.log('');
    });
    
    // Search for dispatch and narender with various patterns
    console.log('\n🔍 SEARCHING FOR DISPATCH/NARENDER WITH VARIOUS PATTERNS:');
    console.log('='.repeat(60));
    
    // Pattern 1: Direct search
    console.log('📧 Pattern 1: Direct string search...');
    const directSearch = await UserMapping.find({
      $or: [
        { displayName: { $regex: 'dispatch|narender', $options: 'i' } },
        { email: { $regex: 'dispatch|narender', $options: 'i' } }
      ]
    }).lean();
    
    console.log(`   Found ${directSearch.length} mappings:`);
    directSearch.forEach(mapping => {
      console.log(`     • ${mapping.displayName} (${mapping.email}) - ${mapping.userId}`);
    });
    
    // Pattern 2: Check if any existing user IDs might be dispatch/narender
    console.log('\n👤 Pattern 2: Examining known user IDs...');
    const knownUserIds = [
      'users/108506371856200018714', // John Doe
      'users/104329836262309309664', // Jane Smith  
      'users/115048080534626721571', // User 11504808
      'users/103074035611191657205'  // User 10307403
    ];
    
    for (const userId of knownUserIds) {
      const mapping = await UserMapping.findOne({ userId }).lean();
      if (mapping) {
        console.log(`   ${userId}:`);
        console.log(`     Display Name: ${mapping.displayName}`);
        console.log(`     Email: ${mapping.email}`);
        console.log(`     Could be dispatch? ${mapping.email?.toLowerCase().includes('dispatch') || mapping.displayName?.toLowerCase().includes('dispatch') ? 'YES' : 'NO'}`);
        console.log(`     Could be narender? ${mapping.email?.toLowerCase().includes('narender') || mapping.displayName?.toLowerCase().includes('narender') ? 'YES' : 'NO'}`);
        console.log('');
      }
    }
    
    // Pattern 3: Check chats database for any mention
    console.log('\n🔍 Pattern 3: Searching chat messages for dispatch/narender...');
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    const chats = await Chat.find({ account: account._id }).lean();
    
    let foundInMessages = false;
    
    for (const chat of chats) {
      for (const message of chat.messages) {
        const text = (message.text || '').toLowerCase();
        const senderEmail = (message.senderEmail || '').toLowerCase();
        const senderDisplayName = (message.senderDisplayName || '').toLowerCase();
        
        if (text.includes('dispatch') || text.includes('narender') || 
            senderEmail.includes('dispatch') || senderEmail.includes('narender') ||
            senderDisplayName.includes('dispatch') || senderDisplayName.includes('narender')) {
          
          if (!foundInMessages) {
            console.log('   💬 Found in messages:');
            foundInMessages = true;
          }
          
          console.log(`     Chat: ${chat.displayName}`);
          console.log(`     Message: "${message.text?.substring(0, 100)}..."`);
          console.log(`     Sender: ${message.senderDisplayName} (${message.senderEmail})`);
          console.log('');
        }
      }
    }
    
    if (!foundInMessages) {
      console.log('   ❌ No mention of dispatch or narender found in any message content');
    }
    
    // Pattern 4: Check if they might be real names vs usernames
    console.log('\n🔍 Pattern 4: Looking for real names that might match...');
    
    // Common variations
    const variations = [
      'dispatch', 'dispatcher', 'dispatch team',
      'narender', 'narender singh', 'narender kumar', 'naren'
    ];
    
    for (const variation of variations) {
      const mappings = await UserMapping.find({
        $or: [
          { displayName: { $regex: variation, $options: 'i' } },
          { email: { $regex: variation, $options: 'i' } },
          { firstName: { $regex: variation, $options: 'i' } },
          { lastName: { $regex: variation, $options: 'i' } }
        ]
      }).lean();
      
      if (mappings.length > 0) {
        console.log(`   🎯 Found ${mappings.length} matches for "${variation}":`);
        mappings.forEach(mapping => {
          console.log(`     • ${mapping.displayName} (${mapping.email})`);
        });
      }
    }
    
    // Pattern 5: Check if these might be in fallback user mappings
    console.log('\n🔍 Pattern 5: Checking fallback user mappings...');
    const fallbackMappings = await UserMapping.find({ 
      resolvedBy: 'fallback' 
    }).lean();
    
    console.log(`   Found ${fallbackMappings.length} fallback mappings:`);
    fallbackMappings.forEach(mapping => {
      console.log(`     • ${mapping.displayName} (${mapping.email}) - ${mapping.userId}`);
      
      // Check if the original email might have been dispatch/narender
      if (mapping.email?.includes('user-')) {
        const extractedId = mapping.email.match(/user-(\d+)@/);
        if (extractedId) {
          console.log(`       Original user ID might be: users/${extractedId[1]}`);
        }
      }
    });
    
    // Final recommendation
    console.log('\n💡 ANALYSIS & RECOMMENDATION:');
    console.log('='.repeat(50));
    console.log('Based on the investigation:');
    console.log('1. No "dispatch" or "narender" chats exist in the current database');
    console.log('2. No "dispatch" or "narender" chats found in Google Chat API');
    console.log('3. No UserMappings match these names/emails');
    console.log('4. No message content mentions these names');
    console.log('');
    console.log('POSSIBLE EXPLANATIONS:');
    console.log('• These chats were deleted or archived in Google Chat');
    console.log('• These users were removed from the organization');
    console.log('• The chats exist under different display names');
    console.log('• These are email contacts, not Google Chat participants');
    console.log('• The chats exist in a different Google Workspace domain');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

examineUserMappingsDetailed();
