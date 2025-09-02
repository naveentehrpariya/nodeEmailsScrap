require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function debugFullApiLogic() {
  try {
    console.log('🔍 DEBUGGING FULL API LOGIC');
    console.log('='.repeat(60));
    
    // Connect to database
    await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');
    
    // === EXACT COPY OF ChatController.getAccountChats LOGIC ===
    const accountEmail = 'naveendev@crossmilescarrier.com';
    const page = 1;
    const limit = 20;
    
    console.log('📄 Getting chats from database for:', accountEmail);
    
    // Find account by email or ObjectId
    let account;
    if (accountEmail.includes('@')) {
      account = await Account.findOne({ email: accountEmail });
    } else {
      account = await Account.findById(accountEmail);
    }

    if (!account) {
      console.log('❌ Account not found');
      return;
    }

    const skip = (page - 1) * limit;

    // Get chats with pagination - DATABASE ONLY
    const chats = await Chat.find({ account: account._id })
      .sort({ lastMessageTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalChats = await Chat.countDocuments({ account: account._id });
    const totalPages = Math.ceil(totalChats / limit);
    
    console.log(`📊 Found ${chats.length} chats out of ${totalChats} total`);
    
    // Format chats for frontend using STORED DATA only
    const formattedChats = [];
    const chatDeduplicationMap = new Map(); // Track chats by participant to avoid duplicates
    
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      const isTarget = (chat.spaceId === 'spaces/ilSNZCAAAAE' || chat.spaceId === 'spaces/w9y_pCAAAAE');
      
      if (isTarget) {
        console.log(`\n🎯 PROCESSING TARGET CHAT #${i + 1}: ${chat.displayName} (${chat.spaceId})`);
      } else {
        console.log(`\n📄 Processing chat #${i + 1}: ${chat.displayName} (${chat.spaceType})`);
      }
      
      // Get the last message info from stored data
      let lastMessage = 'No messages';
      if (chat.messages.length > 0) {
        const lastMsg = chat.messages[chat.messages.length - 1];
        let senderName = 'Unknown';
        
        if (lastMsg.isSentByCurrentUser) {
          senderName = 'You';
        } else {
          // Use stored sender display name (resolved during sync)
          senderName = lastMsg.senderDisplayName || 
                     (lastMsg.senderEmail ? lastMsg.senderEmail.split('@')[0] : 'Unknown');
        }
        
        lastMessage = `${senderName}: ${lastMsg.text || '(no text)'}`;
      }

      // Determine chat title
      let chatTitle = chat.displayName || '';
      let chatAvatar = '👥';

      if (chat.spaceType === 'DIRECT_MESSAGE') {
        console.log(`   📱 This is a DIRECT MESSAGE chat`);
        
        // For direct messages: try to resolve real names using Google Directory API
        let otherParticipantName = null;
        let otherParticipant = null;
        
        // NEW: First try to find other participant from participants array (handles one-way conversations)
        if (chat.participants && chat.participants.length > 0) {
          console.log(`   📋 Found ${chat.participants.length} participants in array`);
          const nonCurrentUserParticipants = chat.participants.filter(p => 
            p.email !== account.email && p.email !== `${account.email}`
          );
          
          if (nonCurrentUserParticipants.length > 0) {
            const participant = nonCurrentUserParticipants[0];
            otherParticipant = {
              id: participant.userId || `inferred_${participant.email}`,
              email: participant.email,
              displayName: participant.displayName,
              count: 1 // Assume at least 1 for participants
            };
            console.log(`   👥 Found other participant via participants array: ${otherParticipant.email} - ${otherParticipant.displayName}`);
          } else {
            console.log(`   ❌ No valid non-current-user participants found`);
          }
        } else {
          console.log(`   ❌ No participants array or it's empty`);
        }
        
        // FALLBACK: If no participant found via participants array, try message analysis
        if (!otherParticipant) {
          console.log(`   🔍 Fallback: Analyzing messages for participants...`);
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
          
          // Find the other participant (not the current user)
          let currentUserParticipant = null;
          
          // First pass: identify current user and other participants
          for (const [senderId, info] of allSenders.entries()) {
            const isCurrentUser = info.email === account.email || info.isSentByCurrentUser;
            
            if (isCurrentUser) {
              currentUserParticipant = { id: senderId, ...info };
              console.log(`   👤 Identified current user: ${senderId} (${info.email || 'no email'})`);
            } else {
              // This is another participant
              if (!otherParticipant || info.count > otherParticipant.count) {
                otherParticipant = {
                  id: senderId,
                  email: info.email,
                  displayName: info.displayName,
                  count: info.count
                };
                console.log(`   👥 Found other participant via messages: ${senderId} (${info.email || 'no email'}) - ${info.displayName}`);
              }
            }
          }
        }
        
        // BACKUP: Try metadata if still no participant found
        if (!otherParticipant && chat.metadata && chat.metadata.primaryOtherParticipant) {
          console.log(`   🔍 Backup: Checking metadata...`);
          const metaParticipant = chat.metadata.primaryOtherParticipant;
          otherParticipant = {
            id: `metadata_${metaParticipant.email}`,
            email: metaParticipant.email,
            displayName: metaParticipant.displayName,
            count: 1
          };
          console.log(`   👥 Found other participant via metadata: ${otherParticipant.email} - ${otherParticipant.displayName}`);
        }
        
        // Debug logging
        console.log(`   🔍 Participant analysis for chat ${chat.displayName}:`);
        console.log(`      Other participant: ${otherParticipant?.email || 'not found'} - ${otherParticipant?.displayName}`);
        
        // If we couldn't find the other participant, skip this chat
        if (!otherParticipant) {
          if (isTarget) {
            console.log(`   ❌ TARGET CHAT SKIPPED: No other participant found`);
          } else {
            console.log(`   ❌ CHAT SKIPPED: No other participant found`);
          }
          continue;
        }
        
        // Try to resolve the participant's real name using Google Directory API with caching
        let resolvedName = null; // Skip Google API for now
        
        // Priority: Google Directory API result > stored displayName > email prefix > fallback
        otherParticipantName = resolvedName || otherParticipant.displayName;
        
        if (!otherParticipantName && otherParticipant.email && otherParticipant.email.includes('@')) {
          otherParticipantName = otherParticipant.email.split('@')[0];
        }
        
        if (!otherParticipantName) {
          otherParticipantName = `User ${otherParticipant.id.substring(0, 8)}`;
        }
        
        // Filter out unresolved users (keep only properly resolved names)
        if (!otherParticipantName) {
          otherParticipantName = 'Unknown User';
        }
        
        // More permissive logic: Show most chats unless they are clearly invalid
        let shouldShow = true;
        let showReason = 'default';
        
        // Check if this is a real resolved name (not fallback) 
        const hasResolvedName = resolvedName && resolvedName !== otherParticipant?.displayName;
        const hasProperEmail = otherParticipant?.email && 
          otherParticipant.email.includes('@') && 
          !otherParticipant.email.includes('user-') && 
          !otherParticipant.email.endsWith('@unknown');
        const hasStoredDisplayName = otherParticipant?.displayName && 
          !otherParticipant.displayName.startsWith('User ') &&
          !otherParticipant.displayName.startsWith('Unknown');
        
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
          // Even for poor emails, show with email prefix as fallback
          otherParticipantName = otherParticipant.email.split('@')[0];
          shouldShow = true;
          showReason = 'email_fallback';
        } else if (otherParticipant?.id) {
          // Final fallback: show with user ID
          otherParticipantName = `User ${otherParticipant.id.substring(otherParticipant.id.lastIndexOf('/') + 1, otherParticipant.id.lastIndexOf('/') + 9)}`;
          shouldShow = true;
          showReason = 'id_fallback';
        } else {
          // Only skip if we have absolutely no participant info
          shouldShow = false;
          showReason = 'no_participant_info';
        }
        
        console.log(`   🔍 User resolution for ${otherParticipantName || 'Unknown'}:`, {
          resolvedName: resolvedName,
          storedDisplayName: otherParticipant?.displayName,
          email: otherParticipant?.email,
          hasResolvedName,
          hasProperEmail,
          hasStoredDisplayName,
          shouldShow,
          showReason
        });
        
        if (!shouldShow) {
          if (isTarget) {
            console.log(`   ❌ TARGET CHAT SKIPPED due to: ${showReason}`);
          } else {
            console.log(`   ❌ CHAT SKIPPED due to: ${showReason}`);
          }
          continue;
        }
        
        console.log(`   ✅ Showing chat with reason: ${showReason}`);
        
        // Use resolved title from stored data
        chatTitle = otherParticipantName;
        chatAvatar = chatTitle.charAt(0).toUpperCase();
        
        console.log(`   ✅ DM title from stored data: ${chatTitle}`);
        
        // Check for duplicate chats with same participant
        const participantKey = otherParticipant.id || otherParticipantName;
        if (chatDeduplicationMap.has(participantKey)) {
          const existingChat = chatDeduplicationMap.get(participantKey);
          // Keep the chat with more recent activity
          if (chat.lastMessageTime > existingChat.lastMessageTime) {
            console.log(`   🔄 Replacing older chat with same participant: ${otherParticipantName}`);
            chatDeduplicationMap.set(participantKey, {
              chat: chat,
              chatTitle: chatTitle,
              chatAvatar: chatAvatar,
              lastMessage: lastMessage,
              lastMessageTime: chat.lastMessageTime
            });
          } else {
            console.log(`   ⏭️ Skipping older chat with same participant: ${otherParticipantName}`);
          }
          continue;
        } else {
          // First time seeing this participant, add to map
          chatDeduplicationMap.set(participantKey, {
            chat: chat,
            chatTitle: chatTitle,
            chatAvatar: chatAvatar,
            lastMessage: lastMessage,
            lastMessageTime: chat.lastMessageTime
          });
          console.log(`   ➕ Adding new chat for participant: ${otherParticipantName}`);
        }
      } else {
        // For spaces/groups: keep Google space displayName as-is
        chatTitle = chat.displayName || '(Unnamed Space)';
        // keep default group avatar
        
        // For groups/spaces, add directly to formatted chats (no deduplication needed)
        formattedChats.push({
          _id: chat._id,
          title: chatTitle,
          participants: chat.participants.map(p => p.displayName || p.email.split('@')[0]),
          lastMessage: lastMessage,
          lastMessageTime: chat.lastMessageTime,
          unreadCount: 0, // TODO: Implement unread count logic
          isGroup: chat.spaceType !== 'DIRECT_MESSAGE',
          avatar: chatAvatar,
          spaceType: chat.spaceType,
          messageCount: chat.messageCount
        });
        console.log(`   ➕ Added SPACE chat: ${chatTitle}`);
      }
    }
    
    // Add deduplicated direct message chats to the final list
    for (const [participantKey, chatData] of chatDeduplicationMap.entries()) {
      console.log(`   📝 Adding deduplicated chat: ${chatData.chatTitle}`);
      formattedChats.push({
        _id: chatData.chat._id,
        title: chatData.chatTitle,
        participants: chatData.chat.participants.map(p => p.displayName || p.email.split('@')[0]),
        lastMessage: chatData.lastMessage,
        lastMessageTime: chatData.lastMessageTime,
        unreadCount: 0, // TODO: Implement unread count logic
        isGroup: chatData.chat.spaceType !== 'DIRECT_MESSAGE',
        avatar: chatData.chatAvatar,
        spaceType: chatData.chat.spaceType,
        messageCount: chatData.chat.messageCount
      });
    }

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`Total chats processed: ${chats.length}`);
    console.log(`Final formatted chats: ${formattedChats.length}`);
    
    // Check if our target chats are in the final list
    const narenderInFinal = formattedChats.some(c => c.title.toLowerCase().includes('narender'));
    const dispatchInFinal = formattedChats.some(c => c.title.toLowerCase().includes('dispatch') || c.title.toLowerCase().includes('miles'));
    
    console.log(`Narender in final results: ${narenderInFinal ? '✅ YES' : '❌ NO'}`);
    console.log(`Dispatch in final results: ${dispatchInFinal ? '✅ YES' : '❌ NO'}`);
    
    console.log(`\n📋 Final chat list:`);
    formattedChats.forEach((chat, i) => {
      console.log(`   ${i + 1}. "${chat.title}" (${chat.spaceType}) - ${chat.messageCount} messages`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

debugFullApiLogic();
