const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

async function diagnoseChatsFiltering() {
  try {
    await mongoose.connect('mongodb://localhost:27017/emailscrap');
    console.log('✅ Connected to MongoDB');
    
    const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    const chats = await Chat.find({ account: account._id }).lean();
    console.log(`📊 Found ${chats.length} chats in database for naveendev account`);
    
    console.log('\n🔍 Analyzing each chat:');
    console.log('='.repeat(60));
    
    const chatDeduplicationMap = new Map();
    let processedForAPI = 0;
    
    for (const chat of chats) {
      console.log(`\n📝 Chat: ${chat.displayName} (${chat.spaceType})`);
      console.log(`   Space ID: ${chat.spaceId}`);
      console.log(`   Messages: ${chat.messages.length}`);
      
      if (chat.spaceType === 'DIRECT_MESSAGE') {
        console.log('   🔍 Analyzing DM participants...');
        
        // Find the other participant by examining ALL messages
        const allSenders = new Map(); // senderId -> {count, email, displayName}
        
        for (const m of chat.messages) {
          if (m.senderId) {
            if (!allSenders.has(m.senderId)) {
              allSenders.set(m.senderId, {
                count: 0,
                email: m.senderEmail || null,
                displayName: m.senderDisplayName || null,
                isSentByCurrentUser: m.isSentByCurrentUser
              });
            }
            allSenders.get(m.senderId).count++;
          }
        }
        
        console.log(`   👥 Found ${allSenders.size} unique senders:`);
        for (const [senderId, info] of allSenders.entries()) {
          console.log(`     - ${senderId}: ${info.displayName || 'no name'} (${info.email || 'no email'}) - ${info.count} messages${info.isSentByCurrentUser ? ' (current user)' : ''}`);
        }
        
        // Find the other participant (not the current user)
        let otherParticipant = null;
        let currentUserParticipant = null;
        
        // First pass: identify current user and other participants
        for (const [senderId, info] of allSenders.entries()) {
          const isCurrentUser = info.email === account.email || info.isSentByCurrentUser;
          
          if (isCurrentUser) {
            currentUserParticipant = { id: senderId, ...info };
            console.log(`   👤 Current user: ${senderId} (${info.email || 'no email'})`);
          } else {
            // This is another participant
            if (!otherParticipant || info.count > otherParticipant.count) {
              otherParticipant = {
                id: senderId,
                email: info.email,
                displayName: info.displayName,
                count: info.count
              };
              console.log(`   👥 Other participant: ${senderId} (${info.email || 'no email'}) - ${info.displayName}`);
            }
          }
        }
        
        if (!otherParticipant) {
          console.log('   ❌ NO OTHER PARTICIPANT FOUND - would be skipped');
          continue;
        }
        
        // Check filtering logic
        const hasResolvedName = false; // We don't have Google API resolution here
        const hasProperEmail = otherParticipant?.email && 
          otherParticipant.email.includes('@') && 
          !otherParticipant.email.includes('user-') && 
          !otherParticipant.email.endsWith('@unknown');
        const hasStoredDisplayName = otherParticipant?.displayName && 
          !otherParticipant.displayName.startsWith('User ') &&
          !otherParticipant.displayName.startsWith('Unknown');
        
        let shouldShow = true;
        let showReason = 'default';
        
        if (hasResolvedName) {
          shouldShow = true;
          showReason = 'resolved_name';
        } else if (hasProperEmail) {
          shouldShow = true;
          showReason = 'proper_email';
        } else if (hasStoredDisplayName) {
          shouldShow = true;
          showReason = 'stored_display_name';
        } else if (otherParticipant?.email) {
          shouldShow = true;
          showReason = 'email_fallback';
        } else if (otherParticipant?.id) {
          shouldShow = true;
          showReason = 'id_fallback';
        } else {
          shouldShow = false;
          showReason = 'no_participant_info';
        }
        
        console.log(`   ✨ Filtering decision:`);
        console.log(`     - hasResolvedName: ${hasResolvedName}`);
        console.log(`     - hasProperEmail: ${hasProperEmail}`);
        console.log(`     - hasStoredDisplayName: ${hasStoredDisplayName}`);
        console.log(`     - shouldShow: ${shouldShow} (reason: ${showReason})`);
        
        if (shouldShow) {
          // Check for deduplication
          const participantKey = otherParticipant.id || otherParticipant.displayName || 'unknown';
          if (chatDeduplicationMap.has(participantKey)) {
            console.log(`   🔄 Would be deduplicated with existing chat for: ${participantKey}`);
          } else {
            chatDeduplicationMap.set(participantKey, chat);
            processedForAPI++;
            console.log(`   ✅ Would be included in API response`);
          }
        } else {
          console.log(`   ❌ Would be SKIPPED from API response`);
        }
        
      } else {
        // Group/Space chat
        console.log('   ✅ Group/Space chat - would be included directly');
        processedForAPI++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY:`);
    console.log(`   - Total chats in database: ${chats.length}`);
    console.log(`   - Chats that would appear in API: ${processedForAPI}`);
    console.log(`   - Direct Messages after deduplication: ${chatDeduplicationMap.size}`);
    console.log(`   - Missing from API: ${chats.length - processedForAPI}`);
    
    // Show deduplication map
    console.log('\n🔍 Deduplicated Direct Messages:');
    for (const [participantKey, chat] of chatDeduplicationMap.entries()) {
      console.log(`   - ${participantKey}: ${chat.displayName}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

diagnoseChatsFiltering();
