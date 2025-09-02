require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

// Use the same connection as the running application
const connectDB = require('./db/config');

async function testChatNames() {
  try {
    await connectDB();
    console.log('Connected to database');
    
    // Find account
    const accounts = await Account.find({}).lean();
    console.log('Available accounts:');
    accounts.forEach(acc => console.log(`  - ${acc.email}`));
    
    const account = accounts.find(acc => acc.email.includes('naveen')) || accounts[0];
    if (!account) {
      console.log('No account found');
      process.exit(1);
    }
    console.log(`\nUsing account: ${account.email}`);
    
    // Check UserMappings
    const totalUserMappings = await UserMapping.countDocuments({});
    console.log(`\nTotal UserMapping entries: ${totalUserMappings}`);
    
    if (totalUserMappings === 0) {
      console.log('❌ UserMapping table is empty. Need to sync workspace users first!');
      process.exit(1);
    }
    
    // Get direct message chats
    const directChats = await Chat.find({ 
      account: account._id, 
      spaceType: 'DIRECT_MESSAGE' 
    }).limit(5).lean();
    
    console.log(`\nFound ${directChats.length} direct message chats:`);
    
    // Load UserMappings for resolution
    const userMappingCache = new Map();
    const allUserMappings = await UserMapping.find({})
        .select('userId displayName email domain confidence resolvedBy').lean();
    
    allUserMappings.forEach(mapping => {
        userMappingCache.set(mapping.userId, mapping);
        userMappingCache.set(mapping.email, mapping);
        // Also cache by numeric ID for users/123 format
        if (mapping.userId && mapping.userId.includes('/')) {
            const numericId = mapping.userId.split('/').pop();
            userMappingCache.set(numericId, mapping);
        }
    });
    
    console.log(`Loaded ${allUserMappings.length} user mappings for name resolution`);
    
    directChats.forEach((chat, i) => {
      console.log(`\nChat ${i+1}: "${chat.displayName}"`);
      console.log(`  spaceId: ${chat.spaceId}`);
      
      // Apply ENHANCED name resolution logic (matching the controller)
      let resolvedName = 'Unknown';
      let foundOtherParticipant = false;
      
      // STRATEGY 1: Check participants array with UserMapping priority
      if (chat.participants && chat.participants.length > 1) {
        const otherParticipants = chat.participants.filter(p => 
          p.email !== account.email
        );
        
        if (otherParticipants.length > 0) {
          const otherParticipant = otherParticipants[0];
          console.log(`  Other participant: displayName="${otherParticipant.displayName}", email="${otherParticipant.email}", userId="${otherParticipant.userId}"`);
          
          // Try UserMapping first using various lookups
          let userMapping = null;
          if (otherParticipant.email) {
            userMapping = userMappingCache.get(otherParticipant.email);
          }
          if (!userMapping && otherParticipant.userId) {
            userMapping = userMappingCache.get(otherParticipant.userId);
          }
          
          if (userMapping) {
            resolvedName = userMapping.displayName;
            foundOtherParticipant = true;
            console.log(`  ✅ RESOLVED via UserMapping: "${resolvedName}"`);
          } else {
            resolvedName = otherParticipant.displayName || otherParticipant.email?.split('@')[0] || 'Unknown User';
            foundOtherParticipant = true;
            console.log(`  ⚠️ Using stored participant data: "${resolvedName}"`);
          }
        }
      }
      
      // STRATEGY 2: If no other participant found, examine message senders with UserMapping priority
      if (!foundOtherParticipant && chat.messages && chat.messages.length > 0) {
        // Get unique senders other than current user
        const uniqueOtherSenders = new Map();
        
        chat.messages.forEach(m => {
          if (!m.isSentByCurrentUser && 
              m.senderEmail !== account.email &&
              m.senderId &&
              m.senderEmail && 
              m.senderEmail.trim() !== '') {
            
            // Try UserMapping resolution for this sender
            let senderMapping = userMappingCache.get(m.senderId) || userMappingCache.get(m.senderEmail);
            
            if (senderMapping) {
              // Use UserMapping name
              uniqueOtherSenders.set(m.senderId, {
                displayName: senderMapping.displayName,
                email: senderMapping.email,
                source: 'UserMapping',
                confidence: senderMapping.confidence || 100
              });
            } else {
              // Use stored message data
              let displayName = m.senderDisplayName;
              
              // Quality check - prefer real names over synthetic ones
              if (!displayName || 
                  displayName.startsWith('User ') ||
                  displayName.startsWith('user-')) {
                
                if (m.senderEmail && 
                    !m.senderEmail.includes('user-') &&
                    m.senderEmail.includes('@')) {
                  displayName = m.senderEmail.split('@')[0];
                } else {
                  displayName = displayName || 'Unknown User';
                }
              }
              
              uniqueOtherSenders.set(m.senderId, {
                displayName,
                email: m.senderEmail,
                source: 'MessageData',
                confidence: 50
              });
            }
          }
        });
        
        if (uniqueOtherSenders.size > 0) {
          // Use the sender with highest confidence (UserMapping preferred)
          const bestSender = Array.from(uniqueOtherSenders.values())
            .sort((a, b) => b.confidence - a.confidence)[0];
          
          resolvedName = bestSender.displayName;
          foundOtherParticipant = true;
          console.log(`  ✅ RESOLVED via ${bestSender.source}: "${resolvedName}" (${bestSender.email})`);
        }
      }
      
      // STRATEGY 3: Final fallbacks
      if (!foundOtherParticipant) {
        if (chat.participants && chat.participants.length === 1) {
          // Only current user in participants - one-way chat or notes to self
          resolvedName = chat.displayName && chat.displayName !== '(Direct Message)' ? chat.displayName : 'My Notes';
          console.log(`  ✅ One-way chat detected: "${resolvedName}"`);
        } else {
          // No participants or messages to work with
          resolvedName = chat.displayName && chat.displayName !== '(Direct Message)' ? chat.displayName : 'Unknown Chat';
          console.log(`  ⚠️ Using displayName fallback: "${resolvedName}"`);
        }
      }
      
      console.log(`  📛 FINAL CHAT NAME: "${resolvedName}"`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testChatNames();
