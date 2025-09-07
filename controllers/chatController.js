const Chat = require('../db/Chat');
const Account = require('../db/Account');
const UserMapping = require('../db/UserMapping');
const ChatSyncScheduler = require('../services/chatSyncScheduler');
const mediaProcessingService = require('../services/mediaProcessingService');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const chatSyncService = require('../services/chatSyncService');

const keys = require('../dispatch.json');
const DOMAIN = "crossmilescarrier.com";

// Helper function to process attachment data for frontend (similar to emailController)
function processAttachmentsForFrontend(attachments, req = null) {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
        return [];
    }
    
    // Determine base URL for attachments - simplified logic
    let baseUrl;
    
    if (req) {
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
        
        console.log(`🔧 [DEBUG] URL Generation - Protocol: ${protocol}, Host: ${host}`);
        
        // Simple logic: if request is from https or production domain, use production URL
        if (protocol === 'https' || host.includes('cmcemail.logistikore.com')) {
            baseUrl = 'https://cmcemail.logistikore.com';
            console.log(`🌐 [DEBUG] Using PRODUCTION URL: ${baseUrl}`);
        } else {
            // Local development
            baseUrl = 'http://localhost:5001';
            console.log(`🏠 [DEBUG] Using LOCAL URL: ${baseUrl}`);
        }
    } else {
        // No request context - use environment variable or default to production
        baseUrl = process.env.APP_URL || 'https://cmcemail.logistikore.com';
        console.log(`⚙️ [DEBUG] No request context - Using: ${baseUrl}`);
    }
    
    return attachments.map(attachment => {
        if (!attachment) {
            return null;
        }
        
        try {
            // For chat attachments, we need to handle different localPath formats
            let filename = attachment.filename || attachment.contentName || attachment.name;
            let attachmentUrl = null;
            
            // If we have a localPath, extract filename and create URL
            if (attachment.localPath) {
                filename = path.basename(attachment.localPath);
                attachmentUrl = `${baseUrl}/api/media/files/${filename}`;
            } else if (filename) {
                // Direct filename-based URL
                attachmentUrl = `${baseUrl}/api/media/files/${filename}`;
            }
            
            return {
                filename: filename,
                originalName: attachment.filename || attachment.contentName || attachment.name,
                mimeType: attachment.mimeType || attachment.contentType || 'application/octet-stream',
                downloadUrl: attachmentUrl ? `${attachmentUrl}?download=${encodeURIComponent(filename)}` : null,
                previewUrl: attachmentUrl,
                localPath: attachment.localPath,
                // Metadata for frontend logic
                isImage: attachment.isImage || (attachment.mimeType || attachment.contentType || '').startsWith('image/'),
                isPdf: (attachment.mimeType || attachment.contentType) === 'application/pdf',
                isVideo: attachment.isVideo || (attachment.mimeType || attachment.contentType || '').startsWith('video/'),
                isAudio: attachment.isAudio || (attachment.mimeType || attachment.contentType || '').startsWith('audio/'),
                isDocument: attachment.isDocument || ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(attachment.mimeType || attachment.contentType),
                // File info
                fileSize: attachment.fileSize || attachment.size,
                fileExtension: path.extname(filename || '').toLowerCase(),
                downloadStatus: attachment.downloadStatus,
                mediaType: attachment.mediaType
            };
        } catch (error) {
            console.error('Error processing chat attachment:', attachment, error.message);
            return null;
        }
    }).filter(Boolean); // Remove null entries
}

// Helper function to process messages and their attachments for frontend
function processMessagesForFrontend(messages, req = null) {
    if (!messages || !Array.isArray(messages)) {
        return [];
    }
    
    return messages.map(message => {
        const processedMessage = { ...message };
        if (message.attachments && message.attachments.length > 0) {
            processedMessage.attachments = processAttachmentsForFrontend(message.attachments, req);
        }
        return processedMessage;
    });
}

class ChatController {
    // Static cache for user resolution to avoid repeated Google API calls
    static userResolutionCache = new Map();
    
    // Get all chats for an account (DATABASE ONLY - No API calls)
    static async getAccountChats(req, res) {
        try {
            const { accountEmail } = req.params;
            const { page = 1, limit = 20 } = req.query;
            
            console.log('📄 [DEBUG] Getting chats from database for:', accountEmail);
            console.log('📄 [DEBUG] Request timestamp:', new Date().toISOString());
            console.log('📄 [DEBUG] Cache buster param:', req.query._);
            
            // Find account by email or ObjectId
            let account;
            if (accountEmail.includes('@')) {
                account = await Account.findOne({ email: accountEmail });
            } else {
                account = await Account.findById(accountEmail);
            }

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            console.log('📄 [DEBUG] Account found:', account._id.toString(), account.email);

            const skip = (page - 1) * limit;

            // Get chats with pagination - DATABASE ONLY
            const chats = await Chat.find({ account: account._id })
                .sort({ lastMessageTime: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            const totalChats = await Chat.countDocuments({ account: account._id });
            const totalPages = Math.ceil(totalChats / limit);
            
            // Pre-load ALL UserMappings (not just workspace) for comprehensive name resolution
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
            
            console.log(`📋 Loaded ${allUserMappings.length} user mappings for name resolution`);
            
            // Helper function to format date and time for chat list
            const formatChatListTime = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                const now = new Date();
                
                // Check if message is from today
                const isToday = date.toDateString() === now.toDateString();
                
                // Check if message is from yesterday
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const isYesterday = date.toDateString() === yesterday.toDateString();
                
                // Check if message is from this week (within last 7 days)
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                const isThisWeek = date > weekAgo;
                
                const timeString = date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
                
                if (isToday) {
                    return timeString; // Just show time for today's messages
                } else if (isYesterday) {
                    return `Yesterday ${timeString}`;
                } else if (isThisWeek) {
                    // Show day name and time for messages within this week
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                    return `${dayName} ${timeString}`;
                } else {
                    // Show full date and time for older messages with year for clarity
                    const dateString = date.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short', 
                        year: '2-digit' // Always show 2-digit year (e.g., '25' for 2025)
                    });
                    return `${dateString} ${timeString}`;
                }
            };
            
            // Helper function to resolve user name from senderId
            const resolveUserFromId = (senderId, senderEmail = null) => {
                if (!senderId) return null;
                
                // Try to find mapping by senderId (multiple formats)
                let mapping = userMappingCache.get(senderId);
                if (!mapping && senderId.includes('/')) {
                    // Try numeric ID
                    const numericId = senderId.split('/').pop();
                    mapping = userMappingCache.get(numericId);
                }
                
                // Try by email if we have it
                if (!mapping && senderEmail) {
                    mapping = userMappingCache.get(senderEmail);
                }
                
                return mapping;
            };
            
            // Format chats for frontend using STORED DATA only
            const formattedChats = [];
            const chatDeduplicationMap = new Map(); // Track chats by participant to avoid duplicates
            
            for (const chat of chats) {
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
                    // SIMPLIFIED RELIABLE APPROACH - Focus on what we have in database
                    let resolvedChatTitle = null;
                    
                    console.log(`   🔍 [DEBUG] Processing DM: ${chat.displayName} (${chat.messages.length} messages, ${chat.participants?.length || 0} participants)`);
                    
                    // Strategy 1: Check participants array with UserMapping priority
                    if (!resolvedChatTitle && chat.participants && chat.participants.length > 1) {
                        const otherParticipants = chat.participants.filter(p => p.email !== account.email);
                        
                        if (otherParticipants.length > 0) {
                            const otherParticipant = otherParticipants[0];
                            
                            // Try UserMapping first
                            const userMapping = userMappingCache.get(otherParticipant.email) || 
                                              userMappingCache.get(otherParticipant.userId);
                            
                            if (userMapping) {
                                resolvedChatTitle = userMapping.displayName;
                                console.log(`   ✅ [DEBUG] UserMapping success: ${resolvedChatTitle} (${otherParticipant.email})`);
                            } else if (otherParticipant.displayName && 
                                      !otherParticipant.displayName.startsWith('User ') && 
                                      !otherParticipant.displayName.startsWith('user-')) {
                                resolvedChatTitle = otherParticipant.displayName;
                                console.log(`   ✅ [DEBUG] Participant displayName: ${resolvedChatTitle}`);
                            } else if (otherParticipant.email && 
                                      otherParticipant.email.includes('@') && 
                                      !otherParticipant.email.includes('user-')) {
                                resolvedChatTitle = otherParticipant.email.split('@')[0];
                                console.log(`   ✅ [DEBUG] Email-based name: ${resolvedChatTitle}`);
                            }
                        }
                    }
                    
                    // Strategy 2: Check message senders for other participants
                    if (!resolvedChatTitle && chat.messages && chat.messages.length > 0) {
                        const uniqueOtherUsers = new Map();
                        
                        // Collect unique senders (not current user)
                        chat.messages.forEach(m => {
                            if (!m.isSentByCurrentUser && 
                                m.senderEmail !== account.email &&
                                m.senderId) {
                                
                                uniqueOtherUsers.set(m.senderId, {
                                    senderId: m.senderId,
                                    senderEmail: m.senderEmail,
                                    senderDisplayName: m.senderDisplayName,
                                    confidence: 70
                                });
                            }
                            
                            // Also check receivers for one-way chats
                            if (m.isSentByCurrentUser && m.receiverInfo && Array.isArray(m.receiverInfo)) {
                                m.receiverInfo.forEach(receiver => {
                                    if (receiver.email && receiver.email !== account.email) {
                                        uniqueOtherUsers.set(receiver.userId || receiver.email, {
                                            senderId: receiver.userId,
                                            senderEmail: receiver.email,
                                            senderDisplayName: receiver.displayName,
                                            confidence: 80 // Higher confidence for receivers
                                        });
                                    }
                                });
                            }
                        });
                        
                        // Try UserMapping for each unique user
                        for (const [userId, userInfo] of uniqueOtherUsers) {
                            const userMapping = userMappingCache.get(userInfo.senderEmail) || 
                                              userMappingCache.get(userId);
                            
                            if (userMapping) {
                                resolvedChatTitle = userMapping.displayName;
                                console.log(`   ✅ [DEBUG] Message UserMapping: ${resolvedChatTitle} (${userInfo.senderEmail})`);
                                break;
                            } else if (userInfo.senderEmail && 
                                      userInfo.senderEmail.includes('@') && 
                                      !userInfo.senderEmail.includes('user-') &&
                                      userInfo.senderEmail.endsWith(`@${DOMAIN}`)) {
                                // Smart email extraction for internal users
                                let smartName = userInfo.senderEmail.split('@')[0];
                                if (smartName.includes('.')) {
                                    smartName = smartName.split('.').map(part => 
                                        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                                    ).join(' ');
                                } else {
                                    smartName = smartName.charAt(0).toUpperCase() + smartName.slice(1).toLowerCase();
                                }
                                resolvedChatTitle = smartName;
                                console.log(`   ✅ [DEBUG] Smart email extraction: ${resolvedChatTitle} (${userInfo.senderEmail})`);
                                break;
                            } else if (userInfo.senderDisplayName && 
                                      !userInfo.senderDisplayName.startsWith('User ') &&
                                      !userInfo.senderDisplayName.startsWith('user-')) {
                                resolvedChatTitle = userInfo.senderDisplayName;
                                console.log(`   ✅ [DEBUG] Message displayName: ${resolvedChatTitle}`);
                                break;
                            }
                        }
                    }
                    
                    // Strategy 3: Check for meaningful space display names
                    if (!resolvedChatTitle && 
                        chat.displayName && 
                        chat.displayName !== '(Direct Message)' && 
                        chat.displayName.trim() !== '' &&
                        !chat.displayName.startsWith('Space ') &&
                        !chat.displayName.startsWith('Chat ')) {
                        
                        resolvedChatTitle = chat.displayName;
                        console.log(`   ✅ [DEBUG] Using space displayName: ${resolvedChatTitle}`);
                    }
                    
                    // Final assignment with better fallbacks
                    if (resolvedChatTitle) {
                        chatTitle = resolvedChatTitle;
                        chatAvatar = chatTitle.charAt(0).toUpperCase();
                    } else {
                        // Better fallback logic
                        const hasOtherUserMessages = chat.messages.some(m => !m.isSentByCurrentUser);
                        const hasReceiverInfo = chat.messages.some(m => m.receiverInfo && m.receiverInfo.length > 0);
                        
                        if (hasOtherUserMessages || hasReceiverInfo) {
                            chatTitle = 'Private Chat';
                            chatAvatar = 'P';
                            console.log(`   ✅ [DEBUG] Evidence of other user: ${chatTitle}`);
                        } else {
                            chatTitle = 'My Notes';
                            chatAvatar = 'M';
                            console.log(`   ✅ [DEBUG] One-way conversation: ${chatTitle}`);
                        }
                    }
                    
                    // Build comprehensive participants list for frontend
                    // For direct messages, we want to show BOTH users: current user + other participant
                    let participantsList = [];
                    
                    // Get current user's display name (try UserMapping first, fallback to email prefix)
                    let currentUserDisplayName = account.email.split('@')[0];
                    const currentUserMapping = userMappingCache.get(account.email);
                    if (currentUserMapping) {
                        currentUserDisplayName = currentUserMapping.displayName;
                    }
                    
                    if (chat.spaceType === 'DIRECT_MESSAGE') {
                        // For direct messages: ALWAYS include current user first, then other participant
                        participantsList.push(currentUserDisplayName);
                        
                        // Find and add the other participant
                        let otherParticipantAdded = false;
                        
                        // Method 1: Look in chat.participants for other users
                        if (chat.participants && chat.participants.length > 1) {
                            const otherParticipants = chat.participants.filter(p => p.email !== account.email);
                            if (otherParticipants.length > 0) {
                                const otherParticipant = otherParticipants[0];
                                let otherDisplayName;
                                
                                // Try UserMapping first for workspace users
                                if (otherParticipant.email && otherParticipant.email.endsWith(`@${DOMAIN}`)) {
                                    const userMapping = userMappingCache.get(otherParticipant.email) || userMappingCache.get(otherParticipant.userId);
                                    if (userMapping) {
                                        otherDisplayName = userMapping.displayName;
                                    } else {
                                        otherDisplayName = otherParticipant.displayName || otherParticipant.email?.split('@')[0] || 'Unknown User';
                                    }
                                } else {
                                    // External user - use stored data
                                    otherDisplayName = otherParticipant.displayName || otherParticipant.email?.split('@')[0] || 'External Contact';
                                }
                                
                                participantsList.push(otherDisplayName);
                                otherParticipantAdded = true;
                            }
                        }
                        
                        // Method 2: If no other participant found in participants array, use the resolved chatTitle
                        if (!otherParticipantAdded && chatTitle !== 'My Notes' && chatTitle !== 'Unknown Chat' && chatTitle !== currentUserDisplayName) {
                            participantsList.push(chatTitle);
                            otherParticipantAdded = true;
                        }
                        
                        // Method 3: If still no other participant, look in message senders
                        if (!otherParticipantAdded && chat.messages && chat.messages.length > 0) {
                            const otherSender = chat.messages.find(m => 
                                !m.isSentByCurrentUser && 
                                m.senderEmail !== account.email &&
                                m.senderDisplayName &&
                                !m.senderDisplayName.startsWith('User ') &&
                                !m.senderDisplayName.startsWith('user-')
                            );
                            
                            if (otherSender) {
                                participantsList.push(otherSender.senderDisplayName);
                                otherParticipantAdded = true;
                            }
                        }
                        
                        // Method 4: If still no other participant, check message receivers (for one-way chats)
                        if (!otherParticipantAdded && chat.messages && chat.messages.length > 0) {
                            // Look for receiverInfo in messages sent by current user
                            const messageWithReceiver = chat.messages.find(m => 
                                m.isSentByCurrentUser && 
                                m.receiverInfo && 
                                Array.isArray(m.receiverInfo) && 
                                m.receiverInfo.length > 0
                            );
                            
                            if (messageWithReceiver) {
                                const receiver = messageWithReceiver.receiverInfo[0];
                                let receiverDisplayName;
                                
                                // Try UserMapping first for workspace users
                                if (receiver.email && receiver.email.endsWith(`@${DOMAIN}`)) {
                                    const userMapping = userMappingCache.get(receiver.email) || userMappingCache.get(receiver.userId);
                                    if (userMapping) {
                                        receiverDisplayName = userMapping.displayName;
                                    } else {
                                        receiverDisplayName = receiver.displayName || receiver.email?.split('@')[0] || 'Unknown User';
                                    }
                                } else {
                                    // External user - use stored data
                                    receiverDisplayName = receiver.displayName || receiver.email?.split('@')[0] || 'External Contact';
                                }
                                
                                participantsList.push(receiverDisplayName);
                                otherParticipantAdded = true;
                                console.log(`✅ [DEBUG] Using receiver from one-way chat: ${receiverDisplayName}`);
                            }
                        }
                        
                        // Method 5: If we have a meaningful chat title, use it as the other participant
                        if (!otherParticipantAdded && chatTitle && 
                            chatTitle !== 'My Notes' && 
                            chatTitle !== 'Unknown Chat' && 
                            chatTitle !== currentUserDisplayName && 
                            chatTitle !== '(Direct Message)') {
                            participantsList.push(chatTitle);
                            otherParticipantAdded = true;
                            console.log(`✅ [DEBUG] Using chat title as other participant: ${chatTitle}`);
                        }
                        
                        // Method 6: Final fallback - if still no second participant, try to infer from displayName
                        if (!otherParticipantAdded) {
                            // If this is truly a one-way chat (notes to self), that's fine
                            console.log(`ℹ️ [DEBUG] One-way conversation detected: ${chatTitle}`);
                        }
                    } else {
                        // For group chats: show all participants
                        if (chat.participants && chat.participants.length > 0) {
                            chat.participants.forEach(participant => {
                                let participantDisplayName;
                                
                                // Try UserMapping first for workspace users
                                if (participant.email && participant.email.endsWith(`@${DOMAIN}`)) {
                                    const userMapping = userMappingCache.get(participant.email) || userMappingCache.get(participant.userId);
                                    if (userMapping) {
                                        participantDisplayName = userMapping.displayName;
                                    } else {
                                        participantDisplayName = participant.displayName || participant.email?.split('@')[0] || 'Unknown User';
                                    }
                                } else {
                                    // External user - use stored data
                                    participantDisplayName = participant.displayName || participant.email?.split('@')[0] || 'External Contact';
                                }
                                
                                participantsList.push(participantDisplayName);
                            });
                        }
                    }
                    
                    // Add directly to formatted chats for direct messages
                    formattedChats.push({
                        _id: chat._id,
                        title: chatTitle,
                        participants: participantsList,
                        lastMessage: lastMessage,
                        lastMessageTime: formatChatListTime(chat.lastMessageTime),
                        unreadCount: 0, // TODO: Implement unread count logic
                        isGroup: chat.spaceType !== 'DIRECT_MESSAGE',
                        avatar: chatAvatar,
                        spaceType: chat.spaceType,
                        messageCount: chat.messageCount
                    });
                    
                    // End simplified direct message handling
                    continue;
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
                        lastMessageTime: formatChatListTime(chat.lastMessageTime),
                        unreadCount: 0, // TODO: Implement unread count logic
                        isGroup: chat.spaceType !== 'DIRECT_MESSAGE',
                        avatar: chatAvatar,
                        spaceType: chat.spaceType,
                        messageCount: chat.messageCount
                    });
                }
            }
            
            // Add deduplicated direct message chats to the final list
            for (const [participantKey, chatData] of chatDeduplicationMap.entries()) {
                console.log(`📝 Adding deduplicated chat: ${chatData.chatTitle}`);
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

            return res.json({
                status: true,
                data: {
                    chats: formattedChats,
                    account: account,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalChats,
                        pages: totalPages
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching chats:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch chats',
                error: error.message
            });
        }
    }

    // Get messages for a specific chat
    static async getChatMessages(req, res) {
        try {
            const { accountEmail, chatId } = req.params;
            const { page = 1, limit = 50 } = req.query;

            // Find account
            let account;
            if (accountEmail.includes('@')) {
                account = await Account.findOne({ email: accountEmail });
            } else {
                account = await Account.findById(accountEmail);
            }

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            // Find chat
            const chat = await Chat.findOne({
                _id: chatId,
                account: account._id
            }).lean();

            if (!chat) {
                return res.status(404).json({
                    status: false,
                    message: 'Chat not found'
                });
            }

            // Paginate messages (most recent first)
            const skip = (page - 1) * limit;
            const messages = chat.messages
                .sort((a, b) => new Date(a.createTime) - new Date(b.createTime))
                .slice(skip, skip + parseInt(limit));

            // Setup Google Admin Directory API for name resolution
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
                'dispatch@crossmilescarrier.com' // Always use dispatch account for API calls
            );
            const admin = google.admin({ version: "directory_v1", auth });
            
            // Create user resolution cache to avoid duplicate lookups
            const userResolutionCache = new Map();
            
            // Helper function to resolve user names - prioritize stored data over API calls
            const resolveUserName = async (senderId, storedDisplayName, storedEmail = null) => {
                // PRIORITY 1: Use stored data if it looks legitimate (not synthetic)
                if (storedDisplayName && 
                    storedEmail &&
                    !storedDisplayName.startsWith('User ') && 
                    !storedDisplayName.startsWith('Unknown') &&
                    storedEmail.includes('@') &&
                    !storedEmail.includes('user-') &&
                    storedEmail.endsWith('@crossmilescarrier.com')) {
                    console.log(`💾 Using stored data for ${storedEmail}: ${storedDisplayName}`);
                    return storedDisplayName;
                }
                
                // PRIORITY 2: Try Google Directory API resolution with caching
                const cacheKey = storedEmail || senderId;
                
                if (userResolutionCache.has(cacheKey)) {
                    const cachedName = userResolutionCache.get(cacheKey);
                    if (cachedName) {
                        console.log(`💾 Using cached resolution for ${cacheKey}: ${cachedName}`);
                        return cachedName;
                    }
                }
                
                // PRIORITY 3: If stored data doesn't look good, try API resolution
                if (storedEmail && storedEmail.includes('@') && storedEmail.endsWith('@crossmilescarrier.com') && !storedEmail.includes('user-')) {
                    try {
                        console.log(`🔍 Attempting Google Directory API resolution for: ${storedEmail}`);
                        const userRes = await admin.users.get({ userKey: storedEmail });
                        
                        if (userRes && userRes.data && userRes.data.name) {
                            const realName = userRes.data.name.fullName || 
                                           userRes.data.name.displayName || 
                                           userRes.data.name.givenName;
                            if (realName) {
                                console.log(`✅ Google Directory resolved ${storedEmail} -> ${realName}`);
                                userResolutionCache.set(cacheKey, realName);
                                return realName;
                            }
                        }
                    } catch (error) {
                        console.log(`❌ Google Directory API failed for ${storedEmail}: ${error.message}`);
                        userResolutionCache.set(cacheKey, null); // Cache the failure
                    }
                }
                
                // PRIORITY 4: Fallback to stored display name even if it's not perfect
                if (storedDisplayName && !storedDisplayName.startsWith('User ')) {
                    console.log(`⬇️ Using stored display name fallback: ${storedDisplayName}`);
                    return storedDisplayName;
                }
                
                // PRIORITY 5: Extract name from stored email
                if (storedEmail && storedEmail.includes('@') && !storedEmail.includes('user-')) {
                    const emailName = storedEmail.split('@')[0];
                    console.log(`⬇️ Using email prefix fallback: ${emailName}`);
                    return emailName;
                }
                
                // PRIORITY 6: Final fallback
                const fallbackName = storedDisplayName || `User ${senderId.substring(0, 8)}`;
                console.log(`⬇️ Using final fallback: ${fallbackName}`);
                return fallbackName;
            };
            
            // Helper function to format message time intelligently
            const formatMessageTime = (dateStr) => {
                if (!dateStr) return { full: '', short: '', smart: '', date: '' };
                const date = new Date(dateStr);
                const now = new Date();
                
                // Check if message is from today
                const isToday = date.toDateString() === now.toDateString();
                
                // Check if message is from yesterday
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const isYesterday = date.toDateString() === yesterday.toDateString();
                
                // Check if message is from this week (within last 7 days)
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                const isThisWeek = date > weekAgo;
                
                const timeString = date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
                
                let smartFormat;
                if (isToday) {
                    smartFormat = timeString; // Just show time for today's messages
                } else if (isYesterday) {
                    smartFormat = `Yesterday ${timeString}`;
                } else if (isThisWeek) {
                    // Show day name and time for messages within this week
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                    smartFormat = `${dayName} ${timeString}`;
                } else {
                    // Show full date and time for older messages with year for clarity
                    const dateString = date.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short', 
                        year: '2-digit' // Always show 2-digit year (e.g., '25' for 2025)
                    });
                    smartFormat = `${dateString} ${timeString}`;
                }
                
                return {
                    full: date.toLocaleString(),
                    short: timeString,
                    smart: smartFormat, // NEW: Intelligent format that includes date when needed
                    date: date.toLocaleDateString(),
                    timestamp: date.toISOString()
                };
            };
            
            // Format messages for frontend with proper chat alignment and resolved names
            const formattedMessages = await Promise.all(messages.map(async (message) => {
                const isOwn = message.isSentByCurrentUser;
                
                // Resolve the sender name using Google Directory API if available
                const resolvedSenderName = isOwn ? 'You' : await resolveUserName(
                    message.senderId, 
                    message.senderDisplayName, 
                    message.senderEmail // Pass sender email for direct resolution
                );
                const senderName = resolvedSenderName;
                
                // Process attachments for frontend with proper URLs
                const processedAttachments = processAttachmentsForFrontend(message.attachments || [], req);
                
                return {
                    _id: message.messageId,
                    from: isOwn ? account.email : `${resolvedSenderName} <${message.senderEmail}>`,
                    body: message.text,
                    text: message.text, // Include text field for compatibility
                    date: message.createTime,
                    timestamp: new Date(message.createTime).toISOString(),
                    isOwn: isOwn,
                    align: isOwn ? 'right' : 'left', // Chat alignment
                    type: 'text', // Message type (text, image, file, etc.)
                    status: 'sent', // Message status (sent, delivered, read)
                    attachments: processedAttachments, // Use processed attachments with proper URLs
                    
                    // Sender information
                    sender: {
                        id: message.senderId,
                        name: senderName,
                        displayName: message.senderDisplayName,
                        email: message.senderEmail,
                        avatar: senderName.charAt(0).toUpperCase(), // First letter as avatar
                        isCurrentUser: isOwn
                    },
                    // Chat bubble styling hints
                    bubble: {
                        color: isOwn ? 'primary' : 'secondary',
                        position: isOwn ? 'right' : 'left',
                        showAvatar: !isOwn, // Only show avatar for others
                        showName: !isOwn && chat.spaceType !== 'DIRECT_MESSAGE' // Show name in groups
                    },
                    
                    // Time formatting with intelligent date display
                    time: formatMessageTime(message.createTime),
                    
                    // Legacy compatibility fields
                    senderDisplayName: senderName,
                    senderEmail: message.senderEmail,
                    senderId: message.senderId
                };
            }));

            return res.json({
                status: true,
                data: {
                    messages: formattedMessages,
                    chat: {
                        _id: chat._id,
                        title: chat.displayName,
                        spaceType: chat.spaceType,
                        participants: chat.participants
                    },
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: chat.messages.length,
                        pages: Math.ceil(chat.messages.length / limit)
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching chat messages:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch chat messages',
                error: error.message
            });
        }
    }

    // Sync chats from Google Chat API
    static async syncChats(req, res) {
        try {
            const { accountEmail } = req.params;

            // Find account
            let account;
            if (accountEmail.includes('@')) {
                account = await Account.findOne({ email: accountEmail });
            } else {
                account = await Account.findById(accountEmail);
            }

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            // Setup Google Chat API with working scopes (matching index.js)
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
            const currentUserId = await ChatController.getCurrentUserId(auth, account.email);
            
            // Create user mapping for the current account doing the sync
            // Even if we can't get the Google user ID, create a mapping using email as ID
            const currentUserDisplayName = account.email.split('@')[0]; // Extract "naveendev" from "naveendev@crossmilescarrier.com"
            const currentUserDomain = account.email.split('@')[1];
            
            // Try to create user mapping with Google user ID if available, otherwise use email
            const mappingUserId = currentUserId || account.email;
            
            try {
                await UserMapping.findOrCreateUser({
                    userId: mappingUserId, // users/123456789 or email as fallback
                    displayName: currentUserDisplayName, // "naveendev"
                    email: account.email, // "naveendev@crossmilescarrier.com"
                    domain: currentUserDomain, // "crossmilescarrier.com"
                    resolvedBy: currentUserId ? 'sync_account' : 'sync_account_fallback',
                    discoveredByAccount: account._id,
                    confidence: currentUserId ? 100 : 85, // Slightly lower confidence if no Google ID
                    originalUserResourceName: mappingUserId
                });
                
                // Link/normalize any other mapping rows for the same email (e.g., users/<id> vs email key)
                const linkRes = await UserMapping.updateMany(
                    { email: account.email, userId: { $ne: mappingUserId } },
                    {
                        $set: {
                            displayName: currentUserDisplayName,
                            domain: currentUserDomain,
                            resolvedBy: 'sync_account_linked',
                            lastSeen: new Date()
                        },
                        $max: { confidence: currentUserId ? 100 : 85 },
                        $inc: { seenCount: 1 }
                    }
                );
                if (linkRes.modifiedCount > 0) {
                    console.log(`🔗 Linked ${linkRes.modifiedCount} existing mapping variant(s) for ${account.email}`);
                }

                console.log(`👤 Created/updated user mapping for sync account: ${mappingUserId} -> ${currentUserDisplayName} (${account.email})`);
            } catch (mappingError) {
                console.error(`Failed to create user mapping for sync account ${account.email}:`, mappingError.message);
            }

            // ENHANCED: First ensure workspace users are synced for better name resolution
            await ChatController.ensureWorkspaceUsersAreSynced();
            
            // Fetch spaces (chats) with pagination to get ALL chats
            let allSpaces = [];
            let nextPageToken = null;
            
            do {
                try {
                    const spaceParams = { pageSize: 1000 }; // Maximum allowed
                    if (nextPageToken) {
                        spaceParams.pageToken = nextPageToken;
                    }
                    
                    const spaceRes = await chat.spaces.list(spaceParams);
                    const spaces = spaceRes.data.spaces || [];
                    allSpaces.push(...spaces);
                    nextPageToken = spaceRes.data.nextPageToken;
                    
                    console.log(`📄 Fetched ${spaces.length} spaces (total so far: ${allSpaces.length})`);
                } catch (spaceListError) {
                    console.error('Failed to fetch spaces page:', spaceListError.message);
                    break;
                }
            } while (nextPageToken);
            
            console.log(`📋 Found ${allSpaces.length} total spaces to sync for ${account.email}`);
            let syncedChatsCount = 0;
            let syncedMessagesCount = 0;
            let skippedChatsCount = 0;

            for (const space of allSpaces) {
                try {
                    const spaceId = space.name;
                    const spaceType = space.spaceType;
                    const displayName = space.displayName || 
                        (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");

                    // Fetch messages for this space
                    const messageRes = await chat.spaces.messages.list({
                        parent: spaceId,
                        pageSize: 100, // Increased for better sync
                    });

                    const rawMessages = messageRes.data.messages || [];
                    // console.log("rawMessages",rawMessages)
                    const messages = [];

                    // Fetch space members/participants for proper chat identification
                    const participants = [];
                    let spaceMembers = [];
                    
                    try {
                        const membersRes = await chat.spaces.members.list({ parent: spaceId });
                        spaceMembers = membersRes?.data?.memberships || [];
                        console.log(`👥 Found ${spaceMembers.length} members in space ${spaceId}`);
                        
                        // Process each member to create participant entries
                        for (const member of spaceMembers) {
                            if (member.member && member.member.name) {
                                const memberId = member.member.name;
                                const memberInfo = await ChatController.resolveUserId(auth, memberId, spaceId, account._id);
                                
                                participants.push({
                                    userId: memberId,
                                    email: memberInfo.email,
                                    displayName: memberInfo.displayName,
                                    domain: memberInfo.domain,
                                    role: member.role || 'ROLE_MEMBER',
                                    state: member.state || 'JOINED'
                                });
                                
                                console.log(`👤 Added participant: ${memberInfo.displayName} (${memberInfo.email})`);
                            }
                        }
                        
                        // For DIRECT_MESSAGE spaces, learn current user mapping
                        if (spaceType === 'DIRECT_MESSAGE' && participants.length === 2) {
                            const memberUserIds = participants.map(p => p.userId);
                            const senderIdsInMessages = new Set(rawMessages
                                .map(m => m?.sender?.name)
                                .filter(n => typeof n === 'string' && n.startsWith('users/')));

                            // Try to identify current user (one who didn't send recent messages, or by email match)
                            let myUserId = memberUserIds.find(id => !senderIdsInMessages.has(id));
                            
                            // If that fails, match by email
                            if (!myUserId) {
                                const currentUserParticipant = participants.find(p => p.email === account.email);
                                myUserId = currentUserParticipant?.userId;
                            }
                            
                            if (myUserId) {
                                const displayNameSelf = account.email.split('@')[0];
                                try {
                                    await UserMapping.findOrCreateUser({
                                        userId: myUserId,
                                        displayName: displayNameSelf,
                                        email: account.email,
                                        domain: account.email.split('@')[1],
                                        resolvedBy: 'chat_members',
                                        discoveredByAccount: account._id,
                                        confidence: 95, // Higher confidence since we have participant info
                                        originalUserResourceName: myUserId
                                    });
                                    console.log(`👤 Learned current user's Chat ID via membership: ${myUserId} -> ${account.email}`);
                                } catch (e) {
                                    console.warn('Failed to link membership userId to account:', e.message);
                                }
                            }
                        }
                        
                    } catch (e) {
                        console.warn(`Membership lookup failed for space ${spaceId}:`, e.message);
                        // Add fallback participant based on messages if membership fails
                        const uniqueSenders = new Set();
                        rawMessages.forEach(m => {
                            if (m?.sender?.name && m.sender.name.startsWith('users/')) {
                                uniqueSenders.add(m.sender.name);
                            }
                        });
                        
                        for (const senderId of uniqueSenders) {
                            const senderInfo = await ChatController.resolveUserId(auth, senderId, spaceId, account._id);
                            participants.push({
                                userId: senderId,
                                email: senderInfo.email,
                                displayName: senderInfo.displayName,
                                domain: senderInfo.domain,
                                role: 'ROLE_MEMBER',
                                state: 'JOINED'
                            });
                        }
                        
                        console.log(`⚠️ Used fallback participant detection, found ${participants.length} participants`);
                    }

                    // Process messages
                    for (const m of rawMessages) {
                        // CRITICAL FIX: Get full message details to ensure we have attachment data
                        let fullMessage;
                        let fullMessageData;
                        try {
                            fullMessage = await chat.spaces.messages.get({
                                name: m.name
                            });
                            fullMessageData = fullMessage.data; // Extract the actual message data
                        } catch (error) {
                            console.error(`Failed to get full message details for ${m.name}:`, error.message);
                            fullMessageData = m; // fallback to basic message
                        }

                        const senderId = fullMessageData.sender?.name || "Unknown";
                        const senderInfo = await ChatController.resolveUserId(auth, senderId, spaceId, account._id);
                        // More reliable current-user detection: compare resolved email to account email
                        const isSentByCurrentUser = senderInfo?.email === account.email;
                        const isExternal = !senderInfo.email.endsWith(`@${DOMAIN}`);

                        // Process attachments if they exist (check both 'attachments' and 'attachment' fields)
                        let processedAttachments = [];
                        let attachments = [];
                        
                        // ENHANCED ATTACHMENT HANDLING - Handle both singular and plural attachment fields
                        if (fullMessageData.attachments && Array.isArray(fullMessageData.attachments)) {
                            attachments = fullMessageData.attachments;
                        } else if (fullMessageData.attachment) {
                            if (Array.isArray(fullMessageData.attachment)) {
                                attachments = fullMessageData.attachment;
                            } else {
                                attachments = [fullMessageData.attachment];
                            }
                        }
                        
                        // Debug logging for attachment detection
                        console.log(`🔍 Message ${m.name} attachment check:`);
                        console.log(`   - fullMessageData.attachments: ${fullMessageData.attachments ? fullMessageData.attachments.length : 'undefined'}`);
                        console.log(`   - fullMessageData.attachment: ${fullMessageData.attachment ? (Array.isArray(fullMessageData.attachment) ? fullMessageData.attachment.length : 1) : 'undefined'}`);
                        console.log(`   - combined attachments: ${attachments.length}`);
                        
                        if (attachments && attachments.length > 0) {
                            try {
                                console.log(`📎 Processing ${attachments.length} attachments for message ${m.name}`);
                                
                                // Add source IDs to attachments for tracking
                                attachments = attachments.map(att => {
                                    // Create a source ID to track attachments through syncs
                                    const sourceId = att.attachmentDataRef?.resourceName || 
                                                    att.driveDataRef?.resourceName || 
                                                    att.name || 
                                                    att.contentName || 
                                                    `${m.name}_attachment_${Math.random().toString(36).substring(2, 10)}`;
                                    return { ...att, sourceId };
                                });
                                
                                const messageWithAttachments = { ...fullMessageData, attachments };
                                processedAttachments = await mediaProcessingService.processMessageAttachmentsWithAuth(messageWithAttachments, auth);
                                
                                // Ensure each attachment has proper metadata
                                processedAttachments = processedAttachments.map(att => {
                                    // Preserve source ID for tracking
                                    const sourceId = att.sourceId || 
                                                    att.attachmentDataRef?.resourceName || 
                                                    att.driveDataRef?.resourceName;
                                    
                                    // Ensure name is set
                                    let name = att.name;
                                    if (!name && att.contentName) {
                                        name = att.contentName;
                                    } else if (!name && att.localFilePath) {
                                        name = att.localFilePath.split('/').pop().replace(/^\d+_/, '');
                                    } else if (!name) {
                                        name = 'Unnamed attachment';
                                    }
                                    
                                    // Ensure media type is set if missing
                                    let mediaType = att.mediaType;
                                    if (!mediaType) {
                                        const contentType = att.contentType || '';
                                        if (contentType.startsWith('image/')) {
                                            mediaType = 'image';
                                        } else if (contentType.startsWith('video/')) {
                                            mediaType = 'video';
                                        } else if (
                                            contentType.startsWith('audio/') ||
                                            contentType === 'application/ogg'
                                        ) {
                                            mediaType = 'audio';
                                        } else if (
                                            contentType === 'application/pdf' ||
                                            contentType.includes('document') ||
                                            contentType.includes('spreadsheet') ||
                                            contentType.includes('presentation')
                                        ) {
                                            mediaType = 'document';
                                        } else {
                                            mediaType = 'other';
                                        }
                                    }
                                    
                                    return {
                                        ...att,
                                        name,
                                        sourceId,
                                        mediaType,
                                        isImage: mediaType === 'image',
                                        isVideo: mediaType === 'video',
                                        isAudio: mediaType === 'audio',
                                        isDocument: mediaType === 'document'
                                    };
                                });
                            } catch (attachmentError) {
                                console.error(`Failed to process attachments for message ${m.name}:`, attachmentError.message);
                                // Keep original attachments if processing fails
                                processedAttachments = attachments.map(att => ({
                                    ...att,
                                    name: att.name || att.contentName || 'Unnamed attachment',
                                    mediaType: 'other',
                                    downloadStatus: 'failed',
                                    downloadError: attachmentError.message,
                                    isImage: false,
                                    isVideo: false,
                                    isAudio: false,
                                    isDocument: false
                                }));
                            }
                        }

                        // Try to link sender to UserMapping reference
                        let senderRef = null;
                        try {
                            const senderMapping = await UserMapping.findOne({
                                $or: [
                                    { userId: senderId },
                                    { email: senderInfo.email },
                                    { userId: senderId.split('/').pop() } // Handle users/123 vs 123 format
                                ]
                            });
                            senderRef = senderMapping?._id || null;
                        } catch (error) {
                            console.warn(`Failed to link sender ${senderId} to UserMapping:`, error.message);
                        }

                        // Determine receiver information for better user identification
                        let receiverIds = [];
                        let receiverInfo = [];
                        
                        // For direct messages, the receiver is the other participant
                        if (spaceType === 'DIRECT_MESSAGE' && participants.length > 0) {
                            const receivers = participants.filter(p => p.userId !== senderId);
                            receiverIds = receivers.map(r => r.userId);
                            receiverInfo = receivers.map(r => ({
                                userId: r.userId,
                                email: r.email,
                                displayName: r.displayName,
                                domain: r.domain
                            }));
                        } else if (spaceType !== 'DIRECT_MESSAGE') {
                            // For group chats, all other participants are potential receivers
                            const receivers = participants.filter(p => p.userId !== senderId);
                            receiverIds = receivers.map(r => r.userId);
                            receiverInfo = receivers.map(r => ({
                                userId: r.userId,
                                email: r.email,
                                displayName: r.displayName,
                                domain: r.domain
                            }));
                        }

                        messages.push({
                            messageId: m.name,
                            text: m.text || "(no text)",
                            senderId,
                            sender: senderRef, // Reference to UserMapping
                            senderEmail: senderInfo.email,
                            senderDisplayName: senderInfo.displayName,
                            senderDomain: senderInfo.domain,
                            // NEW: Receiver information for better identification
                            receiverIds: receiverIds,
                            receiverInfo: receiverInfo,
                            participantsSnapshot: participants, // Full participant list at time of message
                            attachments: processedAttachments,
                            isSentByCurrentUser,
                            isExternal,
                            createTime: new Date(m.createTime),
                            // Enhanced UI properties
                            hasAttachments: processedAttachments.length > 0,
                            hasMedia: processedAttachments.some(att => att.isImage || att.isVideo),
                            hasDocuments: processedAttachments.some(att => att.isDocument)
                        });
                    }

                    // Find or create chat
                    let chatDoc = await Chat.findOne({ spaceId, account: account._id });
                    
                    if (chatDoc) {
                        // Update existing chat with media preservation AND participant updates
                        const existingMessageIds = new Set(chatDoc.messages.map(msg => msg.messageId));
                        const newMessages = messages.filter(msg => !existingMessageIds.has(msg.messageId));
                        
                        // UPDATE: Ensure existing chats have proper participant data
                        if (!chatDoc.participants || chatDoc.participants.length === 0) {
                            console.log(`🔄 Updating existing chat ${chatDoc.spaceId} with ${participants.length} participants`);
                            chatDoc.participants = participants;
                            
                            // Add participant ID fields for easier querying
                            if (participants.length >= 1) {
                                chatDoc.participant_1_id = participants[0].userId;
                            }
                            if (participants.length >= 2) {
                                chatDoc.participant_2_id = participants[1].userId;
                            }
                        }
                        
                        // CRITICAL FIX: Also update existing messages with attachments
                        // This ensures media attachments aren't lost during regular syncs
                        const existingMessagesMap = new Map();
                        chatDoc.messages.forEach(msg => {
                            existingMessagesMap.set(msg.messageId, msg);
                        });
                        
                        // For each message from API, update its attachments in existing message
                        messages.forEach(apiMsg => {
                            if (existingMessagesMap.has(apiMsg.messageId)) {
                                const existingMsg = existingMessagesMap.get(apiMsg.messageId);
                                
                                // Only update if the API message has attachments
                                if (apiMsg.attachments && apiMsg.attachments.length > 0) {
                                    console.log(`🔄 Preserving ${apiMsg.attachments.length} attachments for existing message ${apiMsg.messageId}`);
                                    
                                    // If existing message has no attachments, add them
                                    if (!existingMsg.attachments || existingMsg.attachments.length === 0) {
                                        existingMsg.attachments = apiMsg.attachments;
                                        existingMsg.hasAttachments = true;
                                        existingMsg.hasMedia = apiMsg.hasMedia;
                                        existingMsg.hasDocuments = apiMsg.hasDocuments;
                                    }
                                    // If both have attachments, merge them with improved deduplication
                                    else {
                                        // Create a comprehensive deduplication map using multiple keys
                                        const existingAttMap = new Map();
                                        existingMsg.attachments.forEach((att, index) => {
                                            // Use multiple keys for robust deduplication
                                            const keys = [
                                                att.sourceId,
                                                att.attachmentDataRef?.resourceName,
                                                att.driveDataRef?.driveFileId,
                                                att.name,
                                                att.contentName,
                                                `${att.name}_${att.contentType}`,
                                                `${att.contentName}_${att.contentType}`
                                            ].filter(key => key && key.trim() !== '');
                                            
                                            keys.forEach(key => {
                                                existingAttMap.set(key, { attachment: att, index });
                                            });
                                        });
                                        
                                        // Check new attachments against existing ones
                                        apiMsg.attachments.forEach(newAtt => {
                                            const possibleKeys = [
                                                newAtt.sourceId,
                                                newAtt.attachmentDataRef?.resourceName,
                                                newAtt.driveDataRef?.driveFileId,
                                                newAtt.name,
                                                newAtt.contentName,
                                                `${newAtt.name}_${newAtt.contentType}`,
                                                `${newAtt.contentName}_${newAtt.contentType}`
                                            ].filter(key => key && key.trim() !== '');
                                            
                                            // Check if this attachment already exists
                                            const isDuplicate = possibleKeys.some(key => existingAttMap.has(key));
                                            
                                            if (!isDuplicate) {
                                                console.log(`  ➕ Adding new attachment: ${newAtt.name || newAtt.contentName}`);
                                                existingMsg.attachments.push(newAtt);
                                            } else {
                                                console.log(`  ⏭️ Skipping duplicate attachment: ${newAtt.name || newAtt.contentName}`);
                                                
                                                // Update existing attachment with any new data (like localPath)
                                                const matchingKey = possibleKeys.find(key => existingAttMap.has(key));
                                                if (matchingKey) {
                                                    const existing = existingAttMap.get(matchingKey);
                                                    const existingAtt = existing.attachment;
                                                    
                                                    // Update with any new download information
                                                    if (newAtt.localPath && !existingAtt.localPath) {
                                                        existingAtt.localPath = newAtt.localPath;
                                                        existingAtt.downloadStatus = 'completed';
                                                        console.log(`    🔄 Updated existing attachment with download path: ${newAtt.localPath}`);
                                                    }
                                                    if (newAtt.fileSize && !existingAtt.fileSize) {
                                                        existingAtt.fileSize = newAtt.fileSize;
                                                        existingAtt.size = newAtt.fileSize;
                                                    }
                                                }
                                            }
                                        });
                                        
                                        // Update flags
                                        existingMsg.hasAttachments = existingMsg.attachments.length > 0;
                                        existingMsg.hasMedia = existingMsg.attachments.some(att => att.isImage || att.isVideo);
                                        existingMsg.hasDocuments = existingMsg.attachments.some(att => att.isDocument);
                                    }
                                }
                            }
                        });
                        
                        // Add completely new messages
                        if (newMessages.length > 0) {
                            chatDoc.messages.push(...newMessages);
                            syncedMessagesCount += newMessages.length;
                        }
                        
                        // Update chat metadata
                        chatDoc.messageCount = chatDoc.messages.length;
                        chatDoc.lastMessageTime = messages.length > 0 ? 
                            new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                            chatDoc.lastMessageTime;
                        
                        await chatDoc.save();
                        console.log(`✅ Updated chat ${chatDoc.spaceId}: ${newMessages.length} new messages, media attachments preserved`);
                        
                    } else {
                        // CRITICAL FIX: Create new chat WITH media attachments processed
                        // This ensures media is restored even after deleting chats from database
                        console.log(`🆕 Creating NEW chat ${spaceId} with ${messages.length} messages`);
                        
                        // Count messages with attachments for logging
                        const messagesWithAttachments = messages.filter(msg => msg.attachments && msg.attachments.length > 0);
                        const totalAttachments = messages.reduce((sum, msg) => sum + (msg.attachments ? msg.attachments.length : 0), 0);
                        
                        if (totalAttachments > 0) {
                            console.log(`📎 New chat includes ${totalAttachments} attachments across ${messagesWithAttachments.length} messages`);
                        }
                        
                        // Extract participant IDs for easier querying
                        let participant_1_id = null;
                        let participant_2_id = null;
                        
                        if (participants.length >= 1) {
                            participant_1_id = participants[0].userId;
                        }
                        if (participants.length >= 2) {
                            participant_2_id = participants[1].userId;
                        }
                        
                        chatDoc = new Chat({
                            account: account._id,
                            spaceId,
                            displayName,
                            spaceType,
                            participants: participants, // Use fetched participants array
                            // NEW: Add individual participant IDs for easier queries
                            participant_1_id: participant_1_id,
                            participant_2_id: participant_2_id,
                            messages,  // messages already have processed attachments from above
                            messageCount: messages.length,
                            lastMessageTime: messages.length > 0 ? 
                                new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                                new Date()
                        });

                        await chatDoc.save();
                        syncedChatsCount++;
                        syncedMessagesCount += messages.length;
                        
                        console.log(`✅ Created chat ${chatDoc.spaceId}: ${messages.length} messages with ${totalAttachments} attachments`);
                    }

                } catch (spaceError) {
                    console.error(`Error syncing space ${space.name}:`, spaceError.message);
                    // Continue with other spaces
                }
            }

            // Update account last sync time
            account.lastChatSync = new Date();
            await account.save();

            // Kick off cross-account user mapping enhancement in background so names propagate regardless of sync order
            setImmediate(() => {
                chatSyncService.enhanceUserMappingsAcrossAccounts()
                    .then(() => {
                        console.log(`✅ Propagated user mappings across chats after syncing ${account.email}`);
                    })
                    .catch(err => {
                        console.error('❌ Cross-account mapping propagation failed:', err.message);
                    });
            });

            return res.json({
                status: true,
                message: 'Chat sync completed successfully',
                data: {
                    syncedChats: syncedChatsCount,
                    syncedMessages: syncedMessagesCount,
                    totalSpaces: allSpaces.length
                }
            });

        } catch (error) {
            console.error('Error syncing chats:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to sync chats',
                error: error.message
            });
        }
    }

    // Helper function to get current user ID
    static async getCurrentUserId(auth, email) {
        const admin = google.admin({ version: "directory_v1", auth });
        try {
            const res = await admin.users.get({ userKey: email });
            return `users/${res.data.id}`;
        } catch (e) {
            console.error(`Failed to resolve current user ID: ${e.message}`);
            return null;
        }
    }

    // Helper function to ensure workspace users are synced for better name resolution
    static async ensureWorkspaceUsersAreSynced() {
        try {
            // Check when we last synced workspace users
            const lastSyncCheck = await UserMapping.findOne({ 
                resolvedBy: 'admin_directory_api',
                domain: DOMAIN 
            }).sort({ lastSeen: -1 }).select('lastSeen');
            
            const now = new Date();
            const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            
            // If we haven't synced workspace users in the last 6 hours, sync them now
            if (!lastSyncCheck || lastSyncCheck.lastSeen < sixHoursAgo) {
                console.log('🔄 Workspace users haven\'t been synced recently, syncing now...');
                
                // Setup Google Admin Directory API
                const auth = new google.auth.JWT(
                    keys.client_email,
                    null,
                    keys.private_key,
                    ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
                    'dispatch@crossmilescarrier.com' // Use admin account
                );
                
                const admin = google.admin({ version: "directory_v1", auth });
                
                // Get workspace users (limited batch for performance)
                const response = await admin.users.list({
                    customer: 'my_customer',
                    maxResults: 100, // Limited batch to avoid delays
                    orderBy: 'email',
                    projection: 'basic'
                });
                
                const users = response.data.users || [];
                console.log(`📊 Syncing ${users.length} workspace users for name resolution`);
                
                let syncedCount = 0;
                for (const user of users) {
                    try {
                        const userId = `users/${user.id}`;
                        const displayName = user.name?.fullName || user.name?.displayName || user.primaryEmail?.split('@')[0];
                        const email = user.primaryEmail;
                        
                        await UserMapping.findOneAndUpdate(
                            { userId },
                            {
                                $set: {
                                    userId: userId,
                                    displayName: displayName,
                                    email: email,
                                    domain: email.split('@')[1],
                                    resolvedBy: 'admin_directory_api',
                                    lastSeen: now,
                                    confidence: 100,
                                    isActive: !user.suspended
                                },
                                $inc: { seenCount: 1 }
                            },
                            { 
                                upsert: true, 
                                new: true,
                                setDefaultsOnInsert: true 
                            }
                        );
                        syncedCount++;
                    } catch (userError) {
                        console.warn(`Failed to sync workspace user ${user.id}:`, userError.message);
                    }
                }
                
                console.log(`✅ Synced ${syncedCount}/${users.length} workspace users for better name resolution`);
            } else {
                console.log('✅ Workspace users are up to date (synced within last 6 hours)');
            }
            
        } catch (error) {
            console.warn('Failed to ensure workspace users are synced:', error.message);
            // Don't fail the entire chat sync if workspace user sync fails
        }
    }

    // Helper function to resolve user ID to user info and create/update user mapping
    static async resolveUserId(auth, userResourceName, spaceId = null, discoveredByAccount = null) {
        try {
            // Handle different formats of userResourceName
            let userId = userResourceName;
            
            // If it's in format "users/123456789", extract the ID but keep original for mapping
            if (userResourceName.includes('/')) {
                userId = userResourceName.split('/').pop();
            }
            
            // First, check if we already have this user in our database
            // Try both full format (users/123456789) and just numeric ID (123456789) for backward compatibility
            let existingMapping = await UserMapping.getUserInfo(userResourceName);
            if (!existingMapping && userResourceName.startsWith('users/')) {
                // Try with just the numeric ID for backward compatibility
                existingMapping = await UserMapping.getUserInfo(userId);
            }
            
            if (existingMapping) {
                return {
                    email: existingMapping.email,
                    displayName: existingMapping.displayName,
                    domain: existingMapping.domain
                };
            }
            
            // If it's already an email (some chat systems send emails directly), handle it
            if (userId.includes('@')) {
                const email = userId;
                const displayName = email.split('@')[0]; // Extract name part before @
                const domain = email.split('@')[1];
                
                // Create or update user mapping using email as both userId and email
                if (discoveredByAccount) {
                    try {
                        await UserMapping.findOrCreateUser({
                            userId: email, // Use email as userId for email-based users
                            displayName: displayName,
                            email: email,
                            domain: domain,
                            resolvedBy: 'email_direct',
                            discoveredByAccount: discoveredByAccount,
                            confidence: 90, // High confidence for direct email resolution
                            originalUserResourceName: userResourceName
                        });
                        console.log(`📧 Created/updated user mapping for email: ${email} -> ${displayName}`);
                    } catch (mappingError) {
                        console.error(`Failed to create user mapping for ${email}:`, mappingError.message);
                    }
                }
                
                return {
                    email: email,
                    displayName: displayName,
                    domain: domain
                };
            }
            
            // Try to resolve the Google user ID via Admin Directory API
            let resolvedUser = null;
            try {
                const admin = google.admin({ version: "directory_v1", auth });
                
                // Try different approaches to get user info
                let userRes = null;
                
                // First try with full userResourceName (users/123456789)
                if (userResourceName.startsWith('users/')) {
                    try {
                        userRes = await admin.users.get({ userKey: userResourceName });
                    } catch (e) {
                        // If that fails, try with just the ID
                        userRes = await admin.users.get({ userKey: userId });
                    }
                } else {
                    // Try with just the ID
                    userRes = await admin.users.get({ userKey: userId });
                }
                
                if (userRes && userRes.data) {
                    const userData = userRes.data;
                    const email = userData.primaryEmail;
                    
                    // Extract display name - prefer user's actual name, fallback to email prefix
                    let displayName = userData.name?.displayName || userData.name?.givenName;
                    if (!displayName && email) {
                        displayName = email.split('@')[0]; // Extract from email like "dispatch@example.com" -> "dispatch"
                    }
                    if (!displayName) {
                        displayName = `User ${userId.substring(0, 8)}`; // Final fallback
                    }
                    
                    resolvedUser = {
                        email: email,
                        displayName: displayName,
                        domain: email.split('@')[1]
                    };
                    
                    // Create user mapping with the ORIGINAL userResourceName as key
                    if (discoveredByAccount) {
                        try {
                            await UserMapping.findOrCreateUser({
                                userId: userResourceName, // Use full userResourceName (users/123456789) as key
                                displayName: resolvedUser.displayName,
                                email: resolvedUser.email,
                                domain: resolvedUser.domain,
                                resolvedBy: 'admin_directory',
                                discoveredByAccount: discoveredByAccount,
                                confidence: 95, // Very high confidence for Admin API resolution
                                originalUserResourceName: userResourceName
                            });
                            console.log(`🔍 Admin API resolved user: ${userResourceName} -> ${resolvedUser.displayName} (${resolvedUser.email})`);
                        } catch (mappingError) {
                            console.error(`Failed to create user mapping for ${userResourceName}:`, mappingError.message);
                        }
                    }
                    
                    return resolvedUser;
                }
            } catch (adminError) {
                console.log(`Admin API resolution failed for ${userResourceName}, using fallback: ${adminError.message}`);
            }
            
            // Enhanced fallback for unknown users
            const shortId = userId.substring(0, 8);
            const fallbackUser = {
                email: `user-${userId}@${DOMAIN}`,
                displayName: `User ${shortId}`,
                domain: DOMAIN
            };
            
            // Create fallback user mapping using original userResourceName as key
            if (discoveredByAccount) {
                try {
                    await UserMapping.findOrCreateUser({
                        userId: userResourceName, // Use full userResourceName as key
                        displayName: fallbackUser.displayName,
                        email: fallbackUser.email,
                        domain: fallbackUser.domain,
                        resolvedBy: 'fallback',
                        discoveredByAccount: discoveredByAccount,
                        confidence: 25, // Low confidence for fallback
                        originalUserResourceName: userResourceName
                    });
                    console.log(`⚠️ Created fallback user mapping: ${userResourceName} -> ${fallbackUser.displayName}`);
                } catch (mappingError) {
                    console.error(`Failed to create fallback user mapping for ${userResourceName}:`, mappingError.message);
                }
            }
            
            return fallbackUser;
            
        } catch (e) {
            console.error(`Failed to resolve user ${userResourceName}: ${e.message}`);
            
            // Final fallback for completely unknown users
            const fallbackName = userResourceName.includes('/') ? 
                `User ${userResourceName.split('/').pop().substring(0, 8)}` : 
                userResourceName;
                
            return {
                email: userResourceName.includes('@') ? userResourceName : `${userResourceName}@unknown`,
                displayName: fallbackName,
                domain: "unknown"
            };
        }
    }
    
    // Get all user mappings with pagination and filtering
    static async getUserMappings(req, res) {
        try {
            const { page = 1, limit = 50, domain, resolvedBy, search } = req.query;
            const skip = (page - 1) * limit;
            
            // Build filter
            const filter = {};
            if (domain) filter.domain = domain;
            if (resolvedBy) filter.resolvedBy = resolvedBy;
            if (search) {
                filter.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { userId: { $regex: search, $options: 'i' } }
                ];
            }
            
            const userMappings = await UserMapping.find(filter)
                .populate('discoveredByAccount', 'email')
                .sort({ confidence: -1, lastSeen: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();
                
            const total = await UserMapping.countDocuments(filter);
            const totalPages = Math.ceil(total / limit);
            
            // Get statistics
            const stats = await UserMapping.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        avgConfidence: { $avg: '$confidence' },
                        byResolution: {
                            $push: {
                                method: '$resolvedBy',
                                confidence: '$confidence'
                            }
                        }
                    }
                },
                {
                    $project: {
                        totalUsers: 1,
                        avgConfidence: { $round: ['$avgConfidence', 1] },
                        resolutionStats: {
                            $reduce: {
                                input: '$byResolution',
                                initialValue: {},
                                in: {
                                    $mergeObjects: [
                                        '$$value',
                                        {
                                            $arrayToObject: [[
                                                {
                                                    k: '$$this.method',
                                                    v: { $add: [{ $ifNull: [{ $getField: { field: '$$this.method', input: '$$value' } }, 0] }, 1] }
                                                }
                                            ]]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]);
            
            return res.json({
                status: true,
                data: {
                    userMappings,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: totalPages
                    },
                    statistics: stats[0] || {
                        totalUsers: 0,
                        avgConfidence: 0,
                        resolutionStats: {}
                    }
                }
            });
            
        } catch (error) {
            console.error('Error fetching user mappings:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch user mappings',
                error: error.message
            });
        }
    }
    
    // Get a specific user mapping
    static async getUserMapping(req, res) {
        try {
            const { userId } = req.params;
            
            const userMapping = await UserMapping.findOne({ userId })
                .populate('discoveredByAccount', 'email')
                .lean();
                
            if (!userMapping) {
                return res.status(404).json({
                    status: false,
                    message: 'User mapping not found'
                });
            }
            
            return res.json({
                status: true,
                data: {
                    userMapping
                }
            });
            
        } catch (error) {
            console.error('Error fetching user mapping:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch user mapping',
                error: error.message
            });
        }
    }
    
    // Get chat sync scheduler status
    static async getChatSyncStatus(req, res) {
        try {
            const status = ChatSyncScheduler.getStatus();
            const userMappingStats = await ChatSyncScheduler.getUserMappingStats();
            
            return res.json({
                status: true,
                data: {
                    scheduler: status,
                    userMappings: userMappingStats
                }
            });
            
        } catch (error) {
            console.error('Error fetching chat sync status:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch chat sync status',
                error: error.message
            });
        }
    }
    
    // Start chat sync scheduler
    static async startChatSync(req, res) {
        try {
            const { cronExpression = '0 */6 * * *' } = req.body; // Default: every 6 hours
            
            const started = ChatSyncScheduler.start(cronExpression);
            
            if (started) {
                return res.json({
                    status: true,
                    message: 'Chat sync scheduler started successfully',
                    data: {
                        cronExpression,
                        nextRun: ChatSyncScheduler.getStatus().stats.nextRun
                    }
                });
            } else {
                return res.status(400).json({
                    status: false,
                    message: 'Chat sync scheduler is already running'
                });
            }
            
        } catch (error) {
            console.error('Error starting chat sync scheduler:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to start chat sync scheduler',
                error: error.message
            });
        }
    }
    
    // Stop chat sync scheduler
    static async stopChatSync(req, res) {
        try {
            const stopped = ChatSyncScheduler.stop();
            
            if (stopped) {
                return res.json({
                    status: true,
                    message: 'Chat sync scheduler stopped successfully'
                });
            } else {
                return res.status(400).json({
                    status: false,
                    message: 'Chat sync scheduler is not running'
                });
            }
            
        } catch (error) {
            console.error('Error stopping chat sync scheduler:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to stop chat sync scheduler',
                error: error.message
            });
        }
    }
    
    // Sync all users from Google Workspace
    static async syncWorkspaceUsers(req, res) {
        try {
            console.log('🔄 Starting Google Workspace user sync...');
            
            // Setup Google Admin Directory API
            const auth = new google.auth.JWT(
                keys.client_email,
                keys.client_id,
                keys.private_key,
                ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
                'dispatch@crossmilescarrier.com' // Use admin account
            );
            
            const admin = google.admin({ version: "directory_v1", auth });
            
            let allUsers = [];
            let nextPageToken = null;
            let pageCount = 0;
            
            do {
                pageCount++;
                console.log(`📄 Fetching users page ${pageCount}${nextPageToken ? ` (token: ${nextPageToken.substring(0, 20)}...)` : ''}`);
                
                const params = {
                    customer: 'my_customer', // Gets all users in the domain
                    maxResults: 500, // Maximum allowed
                    orderBy: 'email',
                    projection: 'full', // Get all user data
                };
                
                if (nextPageToken) {
                    params.pageToken = nextPageToken;
                }
                
                const response = await admin.users.list(params);
                
                const users = response.data.users || [];
                allUsers.push(...users);
                nextPageToken = response.data.nextPageToken;
                
                console.log(`   📊 Retrieved ${users.length} users on this page (total so far: ${allUsers.length})`);
                
            } while (nextPageToken);
            
            console.log(`✅ Fetched ${allUsers.length} total users from Google Workspace`);
            
            // Process and store users in UserMapping collection
            let createdCount = 0;
            let updatedCount = 0;
            let errorCount = 0;
            
            for (const user of allUsers) {
                try {
                    const userId = `users/${user.id}`;
                    const displayName = user.name?.fullName || user.name?.displayName || user.name?.givenName || user.primaryEmail?.split('@')[0] || 'Unknown User';
                    const email = user.primaryEmail;
                    const domain = email ? email.split('@')[1] : DOMAIN;
                    
                    // Create or update user mapping
                    const existingMapping = await UserMapping.findOne({ userId });
                    
                    if (existingMapping) {
                        // Update existing mapping with fresh data from Google
                        await UserMapping.updateOne(
                            { userId },
                            {
                                $set: {
                                    displayName: displayName,
                                    email: email,
                                    domain: domain,
                                    resolvedBy: 'admin_directory_api',
                                    lastSeen: new Date(),
                                    confidence: 100, // Highest confidence for direct workspace sync
                                    // Additional user data
                                    firstName: user.name?.givenName,
                                    lastName: user.name?.familyName,
                                    isActive: !user.suspended,
                                    orgUnitPath: user.orgUnitPath,
                                    lastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime) : null,
                                    creationTime: user.creationTime ? new Date(user.creationTime) : null,
                                },
                                $inc: { seenCount: 1 }
                            }
                        );
                        updatedCount++;
                    } else {
                        // Create new mapping
                        await UserMapping.create({
                            userId: userId,
                            displayName: displayName,
                            email: email,
                            domain: domain,
                            resolvedBy: 'admin_directory_api',
                            discoveredByAccount: new mongoose.Types.ObjectId(), // Create a dummy ObjectId for global sync
                            confidence: 100,
                            originalUserResourceName: userId,
                            lastSeen: new Date(),
                            seenCount: 1,
                            // Additional user data
                            firstName: user.name?.givenName,
                            lastName: user.name?.familyName,
                            isActive: !user.suspended,
                            orgUnitPath: user.orgUnitPath,
                            lastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime) : null,
                            creationTime: user.creationTime ? new Date(user.creationTime) : null,
                        });
                        createdCount++;
                    }
                    
                    // Log progress every 50 users
                    if ((createdCount + updatedCount) % 50 === 0) {
                        console.log(`📊 Progress: ${createdCount + updatedCount}/${allUsers.length} users processed...`);
                    }
                    
                } catch (userError) {
                    console.error(`❌ Failed to process user ${user.id} (${user.primaryEmail}):`, userError.message);
                    errorCount++;
                }
            }
            
            console.log('✅ Google Workspace user sync completed!');
            console.log(`📊 Summary:`);
            console.log(`   - Total users fetched: ${allUsers.length}`);
            console.log(`   - New users created: ${createdCount}`);
            console.log(`   - Existing users updated: ${updatedCount}`);
            console.log(`   - Errors encountered: ${errorCount}`);
            
            // Clear the user resolution cache since we have fresh data
            ChatController.userResolutionCache.clear();
            console.log('🗑️ Cleared user resolution cache to use fresh data');
            
            return res.json({
                status: true,
                message: 'Google Workspace user sync completed successfully',
                data: {
                    totalUsers: allUsers.length,
                    created: createdCount,
                    updated: updatedCount,
                    errors: errorCount,
                    pages: pageCount
                }
            });
            
        } catch (error) {
            console.error('❌ Error syncing workspace users:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to sync workspace users',
                error: error.message
            });
        }
    }
    
    // Get all workspace users from database
    static async getWorkspaceUsers(req, res) {
        try {
            const { page = 1, limit = 50, search, domain, isActive } = req.query;
            const skip = (page - 1) * limit;
            
            // Build filter
            const filter = { resolvedBy: 'admin_directory_api' };
            if (search) {
                filter.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } }
                ];
            }
            if (domain) filter.domain = domain;
            if (isActive !== undefined) filter.isActive = isActive === 'true';
            
            const users = await UserMapping.find(filter)
                .sort({ displayName: 1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();
            
            const total = await UserMapping.countDocuments(filter);
            const totalPages = Math.ceil(total / limit);
            
            // Get summary statistics
            const stats = await UserMapping.aggregate([
                { $match: { resolvedBy: 'admin_directory_api' } },
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                        inactiveUsers: { $sum: { $cond: ['$isActive', 0, 1] } },
                        domains: { $addToSet: '$domain' }
                    }
                }
            ]);
            
            return res.json({
                status: true,
                data: {
                    users: users,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: totalPages
                    },
                    statistics: stats[0] || {
                        totalUsers: 0,
                        activeUsers: 0,
                        inactiveUsers: 0,
                        domains: []
                    }
                }
            });
            
        } catch (error) {
            console.error('Error fetching workspace users:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch workspace users',
                error: error.message
            });
        }
    }
    
    // Search for a specific user by email or ID
    static async searchWorkspaceUser(req, res) {
        try {
            const { query } = req.params; // Can be email, user ID, or name
            
            const searchFilter = {
                $or: [
                    { email: { $regex: query, $options: 'i' } },
                    { displayName: { $regex: query, $options: 'i' } },
                    { firstName: { $regex: query, $options: 'i' } },
                    { lastName: { $regex: query, $options: 'i' } },
                    { userId: query },
                    { userId: `users/${query}` } // In case they search with just the numeric ID
                ]
            };
            
            const users = await UserMapping.find(searchFilter)
                .sort({ confidence: -1, displayName: 1 })
                .limit(20)
                .lean();
            
            return res.json({
                status: true,
                data: {
                    users: users,
                    query: query,
                    found: users.length
                }
            });
            
        } catch (error) {
            console.error('Error searching workspace user:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to search workspace user',
                error: error.message
            });
        }
    }

    // Link existing chats to UserMapping references
    static async linkChatsToUserMappings(req, res) {
        try {
            console.log('🔗 Starting to link existing chats to UserMapping references...');
            
            // Get all chats
            const chats = await Chat.find({});
            console.log(`📊 Found ${chats.length} total chats in database`);
            
            // Debug: Show chat details
            chats.forEach((chat, index) => {
                console.log(`  Chat ${index + 1}: ${chat.displayName} - ${chat.messages.length} messages`);
            });
            let linkedMessagesCount = 0;
            let linkedParticipantsCount = 0;
            let processedChatsCount = 0;
            
            for (const chat of chats) {
                let chatModified = false;
                console.log(`\n🔍 Processing chat: ${chat.displayName} with ${chat.messages.length} messages`);
                
                // Link message senders to UserMapping
                for (const message of chat.messages) {
                    console.log(`  📨 Message: senderId=${message.senderId}, sender=${message.sender}, typeof=${typeof message.sender}`);
                    console.log(`    Condition check: senderId exists=${!!message.senderId}, sender==null=${message.sender == null}, sender==undefined=${message.sender == undefined}`);
                    
                    if (message.senderId && (message.sender == null || message.sender == undefined)) {
                        console.log(`    ✅ Message meets linking criteria, searching for UserMapping...`);
                        try {
                            const senderMapping = await UserMapping.findOne({
                                $or: [
                                    { userId: message.senderId },
                                    { email: message.senderEmail },
                                    { userId: message.senderId.split('/').pop() } // Handle users/123 vs 123 format
                                ]
                            });
                            
                            if (senderMapping) {
                                message.sender = senderMapping._id;
                                linkedMessagesCount++;
                                chatModified = true;
                                console.log(`✅ Linked message sender ${message.senderId} -> ${senderMapping.displayName}`);
                            }
                        } catch (error) {
                            console.warn(`Failed to link message sender ${message.senderId}:`, error.message);
                        }
                    }
                }
                
                // Link chat participants to UserMapping
                for (const participant of chat.participants) {
                    if (participant.userId && !participant.user) {
                        try {
                            const participantMapping = await UserMapping.findOne({
                                $or: [
                                    { userId: participant.userId },
                                    { email: participant.email },
                                    { userId: participant.userId.split('/').pop() } // Handle users/123 vs 123 format
                                ]
                            });
                            
                            if (participantMapping) {
                                participant.user = participantMapping._id;
                                linkedParticipantsCount++;
                                chatModified = true;
                                console.log(`✅ Linked participant ${participant.userId} -> ${participantMapping.displayName}`);
                            }
                        } catch (error) {
                            console.warn(`Failed to link participant ${participant.userId}:`, error.message);
                        }
                    }
                }
                
                // Save chat if modified
                if (chatModified) {
                    await chat.save();
                    processedChatsCount++;
                }
            }
            
            console.log('✅ Chat linking completed!');
            console.log(`📊 Summary:`);
            console.log(`   - Total chats processed: ${processedChatsCount}`);
            console.log(`   - Message senders linked: ${linkedMessagesCount}`);
            console.log(`   - Participants linked: ${linkedParticipantsCount}`);
            
            return res.json({
                status: true,
                message: 'Successfully linked chats to UserMapping references',
                data: {
                    processedChats: processedChatsCount,
                    linkedMessages: linkedMessagesCount,
                    linkedParticipants: linkedParticipantsCount
                }
            });
            
        } catch (error) {
            console.error('❌ Error linking chats to UserMappings:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to link chats to UserMappings',
                error: error.message
            });
        }
    }
    
    // Enhanced get chats with UserMapping population
    static async getAccountChatsWithPopulate(req, res) {
        try {
            const { accountEmail } = req.params;
            const { page = 1, limit = 20 } = req.query;
            
            console.log('📄 Getting chats with populated user data for:', accountEmail);
            
            // Find account by email or ObjectId
            let account;
            if (accountEmail.includes('@')) {
                account = await Account.findOne({ email: accountEmail });
            } else {
                account = await Account.findById(accountEmail);
            }

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            const skip = (page - 1) * limit;

            // Get chats with UserMapping population
            const chats = await Chat.find({ account: account._id })
                .populate('messages.sender', 'displayName email userId confidence')
                .populate('participants.user', 'displayName email userId confidence')
                .sort({ lastMessageTime: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            const totalChats = await Chat.countDocuments({ account: account._id });
            const totalPages = Math.ceil(totalChats / limit);
            
            // Format chats using populated data
            const formattedChats = [];
            
            for (const chat of chats) {
                // Get the last message info using populated data
                let lastMessage = 'No messages';
                if (chat.messages.length > 0) {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    let senderName = 'Unknown';
                    
                    if (lastMsg.isSentByCurrentUser) {
                        senderName = 'You';
                    } else {
                        // Use populated sender data first, fallback to stored data
                        if (lastMsg.sender && lastMsg.sender.displayName) {
                            senderName = lastMsg.sender.displayName;
                        } else {
                            senderName = lastMsg.senderDisplayName || 
                                       (lastMsg.senderEmail ? lastMsg.senderEmail.split('@')[0] : 'Unknown');
                        }
                    }
                    
                    lastMessage = `${senderName}: ${lastMsg.text || '(no text)'}`;
                }

                // Determine chat title
                let chatTitle = chat.displayName || '';
                let chatAvatar = '👥';

                if (chat.spaceType === 'DIRECT_MESSAGE') {
                    // For direct messages: find other participant using populated data
                    let otherParticipantName = null;
                    
                    // Try participants first (if populated)
                    const otherParticipant = chat.participants.find(p => 
                        p.email !== account.email && p.user && p.user.displayName
                    );
                    
                    if (otherParticipant && otherParticipant.user) {
                        otherParticipantName = otherParticipant.user.displayName;
                    } else {
                        // Fallback: examine message senders using populated data
                        const otherSender = chat.messages.find(m => 
                            !m.isSentByCurrentUser && m.sender && m.sender.displayName
                        );
                        
                        if (otherSender && otherSender.sender) {
                            otherParticipantName = otherSender.sender.displayName;
                        } else {
                            // Final fallback: use stored data
                            const fallbackSender = chat.messages.find(m => 
                                !m.isSentByCurrentUser && m.senderEmail !== account.email
                            );
                            if (fallbackSender) {
                                otherParticipantName = fallbackSender.senderDisplayName || 
                                                     fallbackSender.senderEmail?.split('@')[0] || 'Unknown User';
                            }
                        }
                    }
                    
                    if (otherParticipantName) {
                        chatTitle = otherParticipantName;
                        chatAvatar = chatTitle.charAt(0).toUpperCase();
                    } else {
                        // Better fallback: extract a cleaner name from stored data
                        const fallbackSender = chat.messages.find(m => 
                            !m.isSentByCurrentUser && m.senderEmail !== account.email
                        );
                        
                        if (fallbackSender) {
                            if (fallbackSender.senderEmail && fallbackSender.senderEmail.includes('@') && 
                                !fallbackSender.senderEmail.includes('user-')) {
                                // Use email prefix for real emails
                                chatTitle = fallbackSender.senderEmail.split('@')[0];
                                chatAvatar = chatTitle.charAt(0).toUpperCase();
                            } else if (fallbackSender.senderDisplayName && 
                                     !fallbackSender.senderDisplayName.startsWith('user-') && 
                                     !fallbackSender.senderDisplayName.startsWith('User ')) {
                                // Use display name if it looks decent
                                chatTitle = fallbackSender.senderDisplayName;
                                chatAvatar = chatTitle.charAt(0).toUpperCase();
                            } else {
                                // Final fallback: create a friendlier name from user ID
                                const userId = fallbackSender.senderId;
                                if (userId && userId.includes('/')) {
                                    const numericId = userId.split('/').pop();
                                    chatTitle = `User ${numericId.substring(0, 8)}`;
                                } else {
                                    chatTitle = 'Guest User';
                                }
                                chatAvatar = 'G';
                            }
                        } else {
                            chatTitle = 'Unknown User';
                            chatAvatar = '?';
                        }
                    }
                } else {
                    // For spaces/groups: keep Google space displayName as-is
                    chatTitle = chat.displayName || '(Unnamed Space)';
                }

                formattedChats.push({
                    _id: chat._id,
                    title: chatTitle,
                    participants: chat.participants.map(p => ({
                        displayName: p.user?.displayName || p.displayName || p.email?.split('@')[0] || 'Unknown',
                        email: p.user?.email || p.email,
                        userId: p.user?.userId || p.userId,
                        confidence: p.user?.confidence || 0
                    })),
                    lastMessage: lastMessage,
                    lastMessageTime: chat.lastMessageTime,
                    unreadCount: 0, // TODO: Implement unread count logic
                    isGroup: chat.spaceType !== 'DIRECT_MESSAGE',
                    avatar: chatAvatar,
                    spaceType: chat.spaceType,
                    messageCount: chat.messageCount
                });
            }

            return res.json({
                status: true,
                data: {
                    chats: formattedChats,
                    account: account,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalChats,
                        pages: totalPages
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching chats with populate:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch chats with populate',
                error: error.message
            });
        }
    }

    // Debug: Inspect chat data and UserMapping references
    static async debugChatData(req, res) {
        try {
            const { accountEmail } = req.params;
            
            // Find account
            let account;
            if (accountEmail.includes('@')) {
                account = await Account.findOne({ email: accountEmail });
            } else {
                account = await Account.findById(accountEmail);
            }

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            // Get one chat to inspect
            const chat = await Chat.findOne({ account: account._id }).lean();
            
            if (!chat) {
                return res.json({
                    status: true,
                    message: 'No chats found for this account',
                    data: { accountEmail, accountId: account._id }
                });
            }
            
            // Get a message to inspect
            const message = chat.messages && chat.messages.length > 0 ? chat.messages[0] : null;
            
            // Check if we have UserMapping entries for the senders
            let userMappings = [];
            if (message && message.senderId) {
                userMappings = await UserMapping.find({
                    $or: [
                        { userId: message.senderId },
                        { email: message.senderEmail },
                        { userId: message.senderId.split('/').pop() }
                    ]
                }).lean();
            }
            
            return res.json({
                status: true,
                data: {
                    chat: {
                        _id: chat._id,
                        spaceId: chat.spaceId,
                        displayName: chat.displayName,
                        spaceType: chat.spaceType,
                        messageCount: chat.messageCount
                    },
                    sampleMessage: message ? {
                        messageId: message.messageId,
                        senderId: message.senderId,
                        sender: message.sender, // This should be ObjectId reference
                        senderEmail: message.senderEmail,
                        senderDisplayName: message.senderDisplayName,
                        text: message.text?.substring(0, 100) + '...'
                    } : null,
                    userMappingsFound: userMappings.map(u => ({
                        _id: u._id,
                        userId: u.userId,
                        displayName: u.displayName,
                        email: u.email,
                        resolvedBy: u.resolvedBy,
                        confidence: u.confidence
                    }))
                }
            });
            
        } catch (error) {
            console.error('Error debugging chat data:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to debug chat data',
                error: error.message
            });
        }
    }

    // Helper function to fix chats with incomplete participant data using workspace users
    static async fixIncompleteParticipants(req, res) {
        try {
            console.log('🔧 Starting ADVANCED participant detection with workspace user resolution...');
            
            // Find all chats that likely have incomplete participant data
            const problematicChats = await Chat.find({
                $or: [
                    { 'participants': { $size: 0 } }, // No participants
                    { 'participants': { $size: 1 }, spaceType: 'DIRECT_MESSAGE' }, // Direct messages with only 1 participant
                    { 'participants': { $exists: false } }, // Missing participants field
                ]
            });
            
            console.log(`📊 Found ${problematicChats.length} chats with incomplete participant data`);
            
            // Load all workspace users for advanced name resolution
            const workspaceUsers = await UserMapping.find({ 
                resolvedBy: 'admin_directory_api',
                domain: DOMAIN 
            }).lean();
            
            console.log(`💼 Loaded ${workspaceUsers.length} workspace users for name resolution`);
            
            let fixedChatsCount = 0;
            let errorCount = 0;
            
            for (const chat of problematicChats) {
                try {
                    console.log(`\n🔍 Analyzing chat: ${chat.displayName} (${chat.spaceType})`);
                    console.log(`   Current participants: ${chat.participants?.length || 0}`);
                    console.log(`   Messages: ${chat.messages?.length || 0}`);
                    
                    // Extract unique senders from messages
                    const uniqueSenders = new Map();
                    const currentAccountEmail = (await Account.findById(chat.account))?.email;
                    
                    if (!currentAccountEmail) {
                        console.warn(`   ❌ Could not find account for chat ${chat._id}`);
                        errorCount++;
                        continue;
                    }
                    
                    // ENHANCED: Analyze messages with workspace user resolution
                    chat.messages.forEach(message => {
                        if (message.senderId) {
                            let participantInfo = {
                                userId: message.senderId,
                                email: message.senderEmail || 'unknown@unknown.com',
                                displayName: message.senderDisplayName || 'Unknown User',
                                domain: message.senderDomain || 'unknown',
                                role: 'ROLE_MEMBER',
                                state: 'JOINED'
                            };
                            
                            // ENHANCED: Try to resolve using workspace users
                            if (message.senderEmail) {
                                const workspaceUser = workspaceUsers.find(u => 
                                    u.email === message.senderEmail || 
                                    u.userId === message.senderId
                                );
                                
                                if (workspaceUser) {
                                    participantInfo = {
                                        userId: message.senderId,
                                        email: workspaceUser.email,
                                        displayName: workspaceUser.displayName, // Real workspace name!
                                        domain: workspaceUser.domain,
                                        role: 'ROLE_MEMBER',
                                        state: 'JOINED'
                                    };
                                    console.log(`      ✨ Enhanced ${message.senderEmail} -> ${workspaceUser.displayName} (from workspace)`);
                                } else if (message.senderEmail.endsWith(`@${DOMAIN}`)) {
                                    // Try email prefix for internal users without workspace match
                                    participantInfo.displayName = message.senderEmail.split('@')[0];
                                    console.log(`      💼 Used email prefix for internal user: ${participantInfo.displayName}`);
                                }
                            }
                            
                            uniqueSenders.set(message.senderId, participantInfo);
                        }
                    });
                    
                    // ENHANCED: Add current account as participant with workspace resolution
                    const currentUserInMessages = Array.from(uniqueSenders.values()).find(s => s.email === currentAccountEmail);
                    if (!currentUserInMessages) {
                        let currentUserId = null;
                        let currentUserDisplayName = currentAccountEmail.split('@')[0];
                        
                        // Check existing participants for current user
                        const existingCurrentUser = chat.participants?.find(p => p.email === currentAccountEmail);
                        if (existingCurrentUser) {
                            currentUserId = existingCurrentUser.userId;
                        } else {
                            currentUserId = `users/unknown_${Date.now()}`;
                        }
                        
                        // ENHANCED: Try to get real name from workspace
                        const currentWorkspaceUser = workspaceUsers.find(u => u.email === currentAccountEmail);
                        if (currentWorkspaceUser) {
                            currentUserDisplayName = currentWorkspaceUser.displayName;
                            currentUserId = currentWorkspaceUser.userId;
                            console.log(`      ✨ Enhanced current user ${currentAccountEmail} -> ${currentUserDisplayName} (from workspace)`);
                        }
                        
                        uniqueSenders.set(currentUserId, {
                            userId: currentUserId,
                            email: currentAccountEmail,
                            displayName: currentUserDisplayName,
                            domain: currentAccountEmail.split('@')[1],
                            role: 'ROLE_MEMBER',
                            state: 'JOINED'
                        });
                    }
                    
                    // ENHANCED: For direct messages with still only 1 participant, try to infer the other
                    if (chat.spaceType === 'DIRECT_MESSAGE' && uniqueSenders.size === 1) {
                        console.log(`      🔎 Direct message with only 1 participant detected - attempting advanced inference...`);
                        
                        // Look for patterns in message content that might indicate the other user
                        // This is a heuristic approach for edge cases
                        const currentUser = Array.from(uniqueSenders.values())[0];
                        const isCurrentUserAccount = currentUser.email === currentAccountEmail;
                        
                        if (isCurrentUserAccount) {
                            // All messages are from current user - this might be a note to self OR
                            // the other participant never replied but received messages
                            console.log(`      📝 This appears to be a one-way conversation or notes to self`);
                        }
                        
                        // Could add more sophisticated inference here if needed
                        // For now, we'll keep it as a one-participant chat which will be labeled "My Notes"
                    }
                    
                    // Convert to array
                    const reconstructedParticipants = Array.from(uniqueSenders.values());
                    
                    console.log(`   📝 Reconstructed ${reconstructedParticipants.length} participants:`);
                    reconstructedParticipants.forEach((p, index) => {
                        console.log(`      ${index + 1}. ${p.displayName} (${p.email}) [${p.userId}]`);
                    });
                    
                    // Update the chat with reconstructed participants
                    if (reconstructedParticipants.length > 0) {
                        chat.participants = reconstructedParticipants;
                        
                        // Add participant ID fields
                        if (reconstructedParticipants.length >= 1) {
                            chat.participant_1_id = reconstructedParticipants[0].userId;
                        }
                        if (reconstructedParticipants.length >= 2) {
                            chat.participant_2_id = reconstructedParticipants[1].userId;
                        }
                        
                        await chat.save();
                        fixedChatsCount++;
                        
                        console.log(`   ✅ Fixed chat with ${reconstructedParticipants.length} participants (with workspace names!)`);
                    } else {
                        console.log(`   ⚠️ Could not reconstruct participants for this chat`);
                        errorCount++;
                    }
                    
                } catch (chatError) {
                    console.error(`❌ Error fixing chat ${chat._id}:`, chatError.message);
                    errorCount++;
                }
            }
            
            console.log('\n✅ ADVANCED participant fix completed!');
            console.log(`📊 Summary:`);
            console.log(`   - Total problematic chats found: ${problematicChats.length}`);
            console.log(`   - Successfully fixed: ${fixedChatsCount}`);
            console.log(`   - Errors encountered: ${errorCount}`);
            console.log(`   - Workspace users used for name resolution: ${workspaceUsers.length}`);
            
            return res.json({
                status: true,
                message: 'Successfully fixed chats with ADVANCED workspace user resolution',
                data: {
                    totalProblematicChats: problematicChats.length,
                    fixedChats: fixedChatsCount,
                    errors: errorCount,
                    workspaceUsersAvailable: workspaceUsers.length
                }
            });
            
        } catch (error) {
            console.error('❌ Error fixing incomplete participants:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fix incomplete participants',
                error: error.message
            });
        }
    }

    // Fetch real participant names from a specific Google Chat space
    static async fetchRealNamesFromSpace(req, res) {
        try {
            const { spaceId, accountEmail } = req.body;
            
            if (!spaceId) {
                return res.status(400).json({
                    status: false,
                    message: 'spaceId is required. Example: spaces/lVOdZCAAAAE'
                });
            }
            
            // Use provided account email or default
            const email = accountEmail || 'naveendev@crossmilescarrier.com';
            
            console.log(`🔍 Fetching real participant names from space: ${spaceId}`);
            console.log(`📧 Using account: ${email}`);
            
            // Setup Google Chat API with all required scopes
            const SCOPES = [
                "https://www.googleapis.com/auth/chat.spaces.readonly",
                "https://www.googleapis.com/auth/chat.messages.readonly",
                "https://www.googleapis.com/auth/admin.directory.user.readonly",
                "https://www.googleapis.com/auth/chat.memberships.readonly", // For reading memberships
                "https://www.googleapis.com/auth/chat.admin.memberships.readonly", // For admin access to memberships
            ];

            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                SCOPES,
                email
            );

            const chat = google.chat({ version: "v1", auth });
            const admin = google.admin({ version: "directory_v1", auth });
            
            // 1. Get space information
            let spaceInfo = null;
            try {
                const spaceRes = await chat.spaces.get({ name: spaceId });
                spaceInfo = spaceRes.data;
                console.log(`📋 Space Info:`, {
                    name: spaceInfo.name,
                    displayName: spaceInfo.displayName,
                    spaceType: spaceInfo.spaceType
                });
            } catch (error) {
                console.error(`❌ Failed to get space info: ${error.message}`);
            }
            
            // 2. Get space members/participants
            let participants = [];
            try {
                const membersRes = await chat.spaces.members.list({ parent: spaceId });
                const spaceMembers = membersRes?.data?.memberships || [];
                
                console.log(`👥 Found ${spaceMembers.length} members in space`);
                
                for (const member of spaceMembers) {
                    if (member.member && member.member.name) {
                        const memberId = member.member.name; // e.g., users/123456789
                        console.log(`\n🔍 Processing member: ${memberId}`);
                        
                        // Try to resolve using Admin Directory API first
                        let memberInfo = {
                            userId: memberId,
                            email: 'unknown@unknown.com',
                            displayName: 'Unknown User',
                            domain: 'unknown',
                            role: member.role || 'ROLE_MEMBER',
                            state: member.state || 'JOINED',
                            resolvedBy: 'fallback'
                        };
                        
                        // Method 1: Try Admin Directory API with numeric ID
                        if (memberId.startsWith('users/')) {
                            const numericId = memberId.split('/')[1];
                            try {
                                console.log(`   🔍 Trying Admin API with numeric ID: ${numericId}`);
                                const userRes = await admin.users.get({ userKey: numericId });
                                
                                if (userRes && userRes.data) {
                                    const userData = userRes.data;
                                    memberInfo = {
                                        userId: memberId,
                                        email: userData.primaryEmail,
                                        displayName: userData.name?.fullName || userData.name?.displayName || userData.name?.givenName || userData.primaryEmail?.split('@')[0],
                                        domain: userData.primaryEmail?.split('@')[1] || 'unknown',
                                        role: member.role || 'ROLE_MEMBER',
                                        state: member.state || 'JOINED',
                                        resolvedBy: 'admin_directory_numeric_id',
                                        firstName: userData.name?.givenName,
                                        lastName: userData.name?.familyName,
                                        orgUnitPath: userData.orgUnitPath,
                                        isActive: !userData.suspended
                                    };
                                    console.log(`   ✅ Admin API SUCCESS: ${memberInfo.email} -> ${memberInfo.displayName}`);
                                }
                            } catch (adminError) {
                                console.log(`   ❌ Admin API failed with numeric ID: ${adminError.message}`);
                            }
                        }
                        
                        // Method 2: Try Admin Directory API with full users/ID format
                        if (memberInfo.resolvedBy === 'fallback') {
                            try {
                                console.log(`   🔍 Trying Admin API with full user ID: ${memberId}`);
                                const userRes = await admin.users.get({ userKey: memberId });
                                
                                if (userRes && userRes.data) {
                                    const userData = userRes.data;
                                    memberInfo = {
                                        userId: memberId,
                                        email: userData.primaryEmail,
                                        displayName: userData.name?.fullName || userData.name?.displayName || userData.name?.givenName || userData.primaryEmail?.split('@')[0],
                                        domain: userData.primaryEmail?.split('@')[1] || 'unknown',
                                        role: member.role || 'ROLE_MEMBER',
                                        state: member.state || 'JOINED',
                                        resolvedBy: 'admin_directory_full_id',
                                        firstName: userData.name?.givenName,
                                        lastName: userData.name?.familyName,
                                        orgUnitPath: userData.orgUnitPath,
                                        isActive: !userData.suspended
                                    };
                                    console.log(`   ✅ Admin API SUCCESS (full ID): ${memberInfo.email} -> ${memberInfo.displayName}`);
                                }
                            } catch (adminError) {
                                console.log(`   ❌ Admin API failed with full ID: ${adminError.message}`);
                            }
                        }
                        
                        // Method 3: Check our UserMapping database
                        if (memberInfo.resolvedBy === 'fallback') {
                            try {
                                console.log(`   🔍 Checking UserMapping database for: ${memberId}`);
                                const mapping = await UserMapping.findOne({
                                    $or: [
                                        { userId: memberId },
                                        { userId: memberId.split('/')[1] }
                                    ]
                                });
                                
                                if (mapping) {
                                    memberInfo = {
                                        userId: memberId,
                                        email: mapping.email,
                                        displayName: mapping.displayName,
                                        domain: mapping.domain,
                                        role: member.role || 'ROLE_MEMBER',
                                        state: member.state || 'JOINED',
                                        resolvedBy: 'user_mapping_database',
                                        confidence: mapping.confidence
                                    };
                                    console.log(`   ✅ UserMapping SUCCESS: ${memberInfo.email} -> ${memberInfo.displayName}`);
                                }
                            } catch (dbError) {
                                console.log(`   ❌ UserMapping query failed: ${dbError.message}`);
                            }
                        }
                        
                        participants.push(memberInfo);
                        console.log(`   📝 Added participant: ${memberInfo.displayName} (${memberInfo.email}) [${memberInfo.resolvedBy}]`);
                    }
                }
            } catch (membersError) {
                console.error(`❌ Failed to get space members: ${membersError.message}`);
            }
            
            // 3. Get recent messages to cross-reference senders
            let messageSenders = [];
            try {
                const messagesRes = await chat.spaces.messages.list({
                    parent: spaceId,
                    pageSize: 50
                });
                
                const messages = messagesRes.data.messages || [];
                console.log(`\n💬 Found ${messages.length} recent messages`);
                
                const uniqueSenders = new Map();
                
                for (const message of messages) {
                    const senderId = message.sender?.name;
                    if (senderId && !uniqueSenders.has(senderId)) {
                        console.log(`\n🔍 Processing message sender: ${senderId}`);
                        
                        // Check if we already resolved this sender in participants
                        const existingParticipant = participants.find(p => p.userId === senderId);
                        
                        if (existingParticipant) {
                            uniqueSenders.set(senderId, existingParticipant);
                            console.log(`   ♻️ Using existing participant data: ${existingParticipant.displayName}`);
                        } else {
                            // Resolve this sender the same way as participants
                            let senderInfo = await ChatController.resolveUserId(auth, senderId, spaceId, null);
                            
                            uniqueSenders.set(senderId, {
                                userId: senderId,
                                email: senderInfo.email,
                                displayName: senderInfo.displayName,
                                domain: senderInfo.domain,
                                role: 'MESSAGE_SENDER',
                                state: 'ACTIVE',
                                resolvedBy: 'message_sender_resolution'
                            });
                            console.log(`   📧 Resolved message sender: ${senderInfo.email} -> ${senderInfo.displayName}`);
                        }
                    }
                }
                
                messageSenders = Array.from(uniqueSenders.values());
            } catch (messagesError) {
                console.error(`❌ Failed to get messages: ${messagesError.message}`);
            }
            
            // 4. Update the specific chat in our database if it exists
            let chatUpdateResult = null;
            try {
                const chatDoc = await Chat.findOne({ spaceId: spaceId });
                if (chatDoc) {
                    console.log(`\n🔄 Found existing chat document, updating participants...`);
                    
                    // Update participants with real names
                    chatDoc.participants = participants;
                    
                    // Update participant ID fields
                    if (participants.length >= 1) {
                        chatDoc.participant_1_id = participants[0].userId;
                    }
                    if (participants.length >= 2) {
                        chatDoc.participant_2_id = participants[1].userId;
                    }
                    
                    await chatDoc.save();
                    chatUpdateResult = {
                        updated: true,
                        chatId: chatDoc._id,
                        spaceId: chatDoc.spaceId,
                        displayName: chatDoc.displayName
                    };
                    console.log(`   ✅ Updated chat document: ${chatDoc.displayName}`);
                } else {
                    console.log(`   ℹ️ No existing chat document found for space: ${spaceId}`);
                    chatUpdateResult = { updated: false, reason: 'Chat document not found in database' };
                }
            } catch (updateError) {
                console.error(`❌ Failed to update chat document: ${updateError.message}`);
                chatUpdateResult = { updated: false, error: updateError.message };
            }
            
            // Return comprehensive results
            return res.json({
                status: true,
                message: 'Successfully fetched real participant names from Google Chat space',
                data: {
                    spaceId: spaceId,
                    spaceInfo: spaceInfo,
                    participants: participants,
                    messageSenders: messageSenders,
                    chatUpdateResult: chatUpdateResult,
                    summary: {
                        totalParticipants: participants.length,
                        totalMessageSenders: messageSenders.length,
                        resolvedByAdminAPI: participants.filter(p => p.resolvedBy?.includes('admin_directory')).length,
                        resolvedByDatabase: participants.filter(p => p.resolvedBy === 'user_mapping_database').length,
                        fallbacks: participants.filter(p => p.resolvedBy === 'fallback').length
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ Error fetching real names from space:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch real names from space',
                error: error.message
            });
        }
    }

    // Run chat sync immediately for all accounts
    static async runChatSyncNow(req, res) {
        try {
            const { accountEmail } = req.body;
            
            if (accountEmail) {
                // Sync specific account
                const result = await ChatSyncScheduler.syncSpecificAccount(accountEmail);
                
                return res.json({
                    status: true,
                    message: 'Account chat sync completed successfully',
                    data: result
                });
            } else {
                // Sync all accounts
                // Run in background to avoid timeout
                setImmediate(() => {
                    ChatSyncScheduler.runFullSync().catch(error => {
                        console.error('Background chat sync failed:', error);
                    });
                });
                
                return res.json({
                    status: true,
                    message: 'Full chat sync started in background. Check status for progress.'
                });
            }
            
        } catch (error) {
            console.error('Error running chat sync:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to run chat sync',
                error: error.message
            });
        }
    }
    
    // Clear all chats for an account
    static async clearAllChats(req, res) {
        const { accountEmail } = req.params;
        
        try {
            console.log(`🗑️ Starting clear all chats for account: ${accountEmail}`);
            
            // Find the account
            const account = await Account.findOne({ email: accountEmail, deletedAt: null });
            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: "Account not found"
                });
            }
            
            // Get counts before deletion for reporting
            const chatsCount = await Chat.countDocuments({ account: account._id, deletedAt: null });
            let totalMessages = 0;
            
            // Count total messages across all chats
            const chatsWithMessages = await Chat.find({ account: account._id, deletedAt: null }).select('messages');
            chatsWithMessages.forEach(chat => {
                if (chat.messages && Array.isArray(chat.messages)) {
                    totalMessages += chat.messages.length;
                }
            });
            
            console.log(`📋 Found ${chatsCount} chats with ${totalMessages} messages to delete`);
            
            // Permanently delete all chats for this account
            const chatDeleteResult = await Chat.deleteMany(
                { account: account._id, deletedAt: null }
            );
            
            // Update account's last chat sync to null since all data is cleared
            await Account.findByIdAndUpdate(account._id, {
                lastChatSync: null,
                chatsClearedAt: new Date()
            });
            
            console.log(`✅ Successfully cleared all chats:`);
            console.log(`   - ${chatDeleteResult.deletedCount} chats permanently deleted`);
            console.log(`   - Approximately ${totalMessages} messages deleted`);
            
            res.status(200).json({
                status: true,
                message: `Successfully cleared all chats for ${accountEmail}`,
                data: {
                    account: accountEmail,
                    deletedChats: chatDeleteResult.deletedCount,
                    deletedMessages: totalMessages,
                    totalItems: chatDeleteResult.deletedCount,
                    clearedAt: new Date()
                }
            });
            
        } catch (error) {
            console.error('Clear all chats error:', error.message);
            return res.status(500).json({
                status: false,
                message: `Failed to clear all chats: ${error.message}`,
                error: error.message
            });
        }
    }
}

module.exports = ChatController;
