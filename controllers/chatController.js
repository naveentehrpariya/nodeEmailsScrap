const Chat = require('../db/Chat');
const Account = require('../db/Account');
const UserMapping = require('../db/UserMapping');
const ChatSyncScheduler = require('../services/chatSyncScheduler');
const mediaProcessingService = require('../services/mediaProcessingService');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const keys = require('../dispatch.json');
const DOMAIN = "crossmilescarrier.com";

class ChatController {
    // Get all chats for an account
    static async getAccountChats(req, res) {
        try {
            const { accountEmail } = req.params;
            const { page = 1, limit = 20 } = req.query;
            
            console.log('🔍 DEBUG: getAccountChats called with:', { accountEmail, page, limit });
            
            // Find account by email or ObjectId
            let account;
            if (accountEmail.includes('@')) {
                console.log('🔍 DEBUG: Searching account by email:', accountEmail);
                account = await Account.findOne({ email: accountEmail });
            } else {
                console.log('🔍 DEBUG: Searching account by ID:', accountEmail);
                account = await Account.findById(accountEmail);
            }
            
            console.log('🔍 DEBUG: Account found:', account ? `${account._id} (${account.email})` : 'null');

            if (!account) {
                return res.status(404).json({
                    status: false,
                    message: 'Account not found'
                });
            }

            const skip = (page - 1) * limit;

            // Get chats with pagination
            const chats = await Chat.find({ account: account._id })
                .sort({ lastMessageTime: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            const totalChats = await Chat.countDocuments({ account: account._id });
            const totalPages = Math.ceil(totalChats / limit);

            // Format chats for frontend
            const formattedChats = chats.map(chat => {
                // Get the last message with sender info
                let lastMessage = 'No messages';
                let lastMessageSender = '';
                
                if (chat.messages.length > 0) {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    const senderName = lastMsg.isSentByCurrentUser ? 'You' : 
                        (lastMsg.senderDisplayName || lastMsg.senderEmail.split('@')[0]);
                    lastMessage = `${senderName}: ${lastMsg.text || '(no text)'}`;
                }
                
                // Generate better chat title and avatar for direct messages
                let chatTitle = chat.displayName;
                let chatAvatar = '👥';
                
                if (chat.spaceType === 'DIRECT_MESSAGE') {
                    // For direct messages, find the other participant
                    const otherParticipant = chat.participants.find(p => p.email !== account.email);
                    if (otherParticipant) {
                        chatTitle = otherParticipant.displayName || otherParticipant.email.split('@')[0];
                        chatAvatar = chatTitle.charAt(0).toUpperCase();
                    } else if (chat.messages.length > 0) {
                        // Fallback: get from messages
                        const otherMessage = chat.messages.find(m => !m.isSentByCurrentUser);
                        if (otherMessage) {
                            chatTitle = otherMessage.senderDisplayName || otherMessage.senderEmail.split('@')[0];
                            chatAvatar = chatTitle.charAt(0).toUpperCase();
                        }
                    }
                }
                
                return {
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
                };
            });

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

            // Format messages for frontend with proper chat alignment
            const formattedMessages = messages.map(message => {
                const isOwn = message.isSentByCurrentUser;
                const senderName = isOwn ? 'You' : message.senderDisplayName;
                
                return {
                    _id: message.messageId,
                    from: isOwn ? account.email : `${message.senderDisplayName} <${message.senderEmail}>`,
                    body: message.text,
                    text: message.text, // Include text field for compatibility
                    date: message.createTime,
                    timestamp: new Date(message.createTime).toISOString(),
                    isOwn: isOwn,
                    align: isOwn ? 'right' : 'left', // Chat alignment
                    type: 'text', // Message type (text, image, file, etc.)
                    status: 'sent', // Message status (sent, delivered, read)
                    attachments: message.attachments || [],
                    
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
                    
                    // Time formatting
                    time: {
                        full: new Date(message.createTime).toLocaleString(),
                        short: new Date(message.createTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                        date: new Date(message.createTime).toLocaleDateString()
                    },
                    
                    // Legacy compatibility fields
                    senderDisplayName: senderName,
                    senderEmail: message.senderEmail,
                    senderId: message.senderId
                };
            });

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

            // Setup Google Chat API with Drive scope for media processing
            const SCOPES = [
                "https://www.googleapis.com/auth/chat.spaces.readonly",
                "https://www.googleapis.com/auth/chat.messages.readonly",
                "https://www.googleapis.com/auth/admin.directory.user.readonly",
                "https://www.googleapis.com/auth/drive.readonly",
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

            // Fetch spaces (chats)
            const spaceRes = await chat.spaces.list();
            const spaces = spaceRes.data.spaces || [];

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
                        pageSize: 100, // Increased for better sync
                    });

                    const rawMessages = messageRes.data.messages || [];
                    const messages = [];

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
                        const senderInfo = await ChatController.resolveUserId(auth, senderId, spaceId);
                        const isSentByCurrentUser = senderId === currentUserId;
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

                        messages.push({
                            messageId: m.name,
                            text: m.text || "(no text)",
                            senderId,
                            senderEmail: senderInfo.email,
                            senderDisplayName: senderInfo.displayName,
                            senderDomain: senderInfo.domain,
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
                        // Update existing chat with media preservation
                        const existingMessageIds = new Set(chatDoc.messages.map(msg => msg.messageId));
                        const newMessages = messages.filter(msg => !existingMessageIds.has(msg.messageId));
                        
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
                                    // If both have attachments, merge them preserving existing ones
                                    else {
                                        // Index existing attachments by source ID or name for deduplication
                                        const existingAttMap = new Map();
                                        existingMsg.attachments.forEach(att => {
                                            const key = att.sourceId || att.name;
                                            existingAttMap.set(key, att);
                                        });
                                        
                                        // Add new attachments that don't exist already
                                        apiMsg.attachments.forEach(newAtt => {
                                            const key = newAtt.sourceId || newAtt.name;
                                            if (!existingAttMap.has(key)) {
                                                existingMsg.attachments.push(newAtt);
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
                        
                        chatDoc = new Chat({
                            account: account._id,
                            spaceId,
                            displayName,
                            spaceType,
                            participants: [], // TODO: Fetch participants
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

            return res.json({
                status: true,
                message: 'Chat sync completed successfully',
                data: {
                    syncedChats: syncedChatsCount,
                    syncedMessages: syncedMessagesCount,
                    totalSpaces: spaces.length
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

    // Helper function to resolve user ID to user info (primarily for reading)
    static async resolveUserId(auth, userResourceName, spaceId = null) {
        try {
            // Handle different formats of userResourceName
            let userId = userResourceName;
            
            // If it's in format "users/123456789", extract the ID
            if (userResourceName.includes('/')) {
                userId = userResourceName.split('/').pop();
            }
            
            // First, check if we already have this user in our database
            const existingMapping = await UserMapping.getUserInfo(userId);
            if (existingMapping) {
                return {
                    email: existingMapping.email,
                    displayName: existingMapping.displayName,
                    domain: existingMapping.domain
                };
            }
            
            // If it's already an email, handle it directly
            if (userId.includes('@')) {
                return {
                    email: userId,
                    displayName: userId.split('@')[0],
                    domain: userId.split('@')[1]
                };
            }
            
            // Enhanced fallback for unknown users (this shouldn't happen often after sync)
            const shortId = userId.substring(0, 8);
            return {
                email: `user-${userId}@${DOMAIN}`,
                displayName: `User ${shortId}`,
                domain: DOMAIN
            };
            
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
                .populate('discoveredByAccount', 'email name')
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
                .populate('discoveredByAccount', 'email name')
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
}

module.exports = ChatController;
