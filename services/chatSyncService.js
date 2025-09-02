const Account = require('../db/Account');
const Chat = require('../db/Chat');
const UserMapping = require('../db/UserMapping');
const { google } = require('googleapis');
const keys = require('../dispatch.json');
const mediaProcessingService = require('./mediaProcessingService');

const DOMAIN = "crossmilescarrier.com";

class ChatSyncService {
    // Sync chats for all accounts
    async syncAllAccountChats() {
        console.log('💬 Starting chat synchronization for all accounts...');
        
        try {
            // Get all accounts that don't have deletedAt set
            const accounts = await Account.find({ 
                deletedAt: { $exists: false }
            });

            if (accounts.length === 0) {
                console.log('⚠️ No accounts found for chat synchronization');
                return [];
            }

            console.log(`📊 Found ${accounts.length} accounts for chat sync`);

            const results = [];
            let totalSyncedChats = 0;
            let totalSyncedMessages = 0;

            // Process each account
            for (const account of accounts) {
                console.log(`💬 Syncing chats for: ${account.email}`);
                
                try {
                    const result = await this.syncAccountChats(account);
                    results.push({
                        accountId: account._id,
                        email: account.email,
                        success: true,
                        syncedChats: result.syncedChats,
                        syncedMessages: result.syncedMessages,
                        totalSpaces: result.totalSpaces,
                        duration: result.duration
                    });

                    totalSyncedChats += result.syncedChats;
                    totalSyncedMessages += result.syncedMessages;

                    console.log(`✅ ${account.email}: ${result.syncedChats} chats, ${result.syncedMessages} messages synced`);
                    
                } catch (error) {
                    console.error(`❌ Failed to sync chats for ${account.email}:`, error.message);
                    results.push({
                        accountId: account._id,
                        email: account.email,
                        success: false,
                        error: error.message,
                        syncedChats: 0,
                        syncedMessages: 0
                    });
                }

                // Add delay between accounts to avoid rate limiting
                await this.sleep(2000);
            }

            console.log(`🎉 Chat sync completed! Total: ${totalSyncedChats} chats, ${totalSyncedMessages} messages`);
            console.log(`🔄 Media attachments preserved during sync. All media should display correctly.`);
            
            // CRITICAL: Run cross-account user mapping enhancement after all accounts are synced
            console.log('🔍 Running cross-account user mapping enhancement...');
            try {
                await this.enhanceUserMappingsAcrossAccounts();
                console.log('✅ User mapping enhancement completed');
            } catch (enhancementError) {
                console.error('❌ User mapping enhancement failed:', enhancementError.message);
                // Don't fail the entire sync - just log the error
            }
            
            return results;

        } catch (error) {
            console.error('❌ Failed to sync chats for all accounts:', error.message);
            throw error;
        }
    }

    // Sync chats for a specific account
    async syncAccountChats(account) {
        const startTime = Date.now();
        
        try {
            // Setup Google Chat API with Drive scope for media processing
            const SCOPES = [
                "https://www.googleapis.com/auth/chat.spaces.readonly",
                "https://www.googleapis.com/auth/chat.messages.readonly",
                "https://www.googleapis.com/auth/admin.directory.user.readonly",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/gmail.readonly"
                // Gmail scope added for automatic attachment downloading via Gmail API
            ];

            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                SCOPES,
                account.email
            );

            const chat = google.chat({ version: "v1", auth });
            const currentUserId = await this.getCurrentUserId(auth, account.email);

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

                    // Fetch ALL messages for this space with pagination
                    console.log(`🔍 Fetching messages for space: ${spaceId} (${displayName})`);
                    const rawMessages = await this.fetchAllMessages(chat, spaceId);
                    console.log(`📨 Found ${rawMessages.length} raw messages in space ${displayName}`);
                    
                    // Log message details for debugging
                    rawMessages.forEach((msg, index) => {
                        const hasAttachments = msg.attachments && msg.attachments.length > 0;
                        console.log(`   Message ${index + 1}: "${(msg.text || '(no text)').substring(0, 50)}..." - Attachments: ${hasAttachments ? msg.attachments.length : 0}`);
                        
                        if (hasAttachments) {
                            msg.attachments.forEach((att, attIndex) => {
                                console.log(`     📎 Attachment ${attIndex + 1}:`, {
                                    name: att.name,
                                    contentName: att.contentName,
                                    contentType: att.contentType,
                                    hasAttachmentDataRef: !!att.attachmentDataRef,
                                    hasDriveDataRef: !!att.driveDataRef
                                });
                            });
                        }
                    });
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
                        const senderInfo = await this.resolveUserId(auth, senderId, spaceId, account._id);
                        const isSentByCurrentUser = senderId === currentUserId;
                        const isExternal = !senderInfo.email.endsWith(`@${DOMAIN}`);

                        // Process attachments if they exist (check both 'attachments' and 'attachment' fields)
                        let processedAttachments = [];
                        let attachments = [];
                        
                        // ENHANCED ATTACHMENT HANDLING - More robust for all sync scenarios
                        // Handle both singular and plural attachment fields
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

                        // Determine message alignment and styling
                        const align = isSentByCurrentUser ? 'right' : 'left';
                        const bubbleClass = isSentByCurrentUser ? 'sent' : 'received';
                        const senderInitials = this.getInitials(senderInfo.displayName);
                        const formattedTime = this.formatMessageTime(new Date(m.createTime));

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
                            align,
                            bubbleClass,
                            senderInitials,
                            formattedTime,
                            hasAttachments: processedAttachments.length > 0,
                            hasMedia: processedAttachments.some(att => att.isImage || att.isVideo),
                            hasDocuments: processedAttachments.some(att => att.isDocument)
                        });
                    }

                    // Find or create chat
                    let chatDoc = await Chat.findOne({ spaceId, account: account._id });
                    
                    if (chatDoc) {
                        // Update existing chat
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
                            participants: [], // TODO: Fetch participants from space members
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

            // Update account last chat sync time
            account.lastChatSync = new Date();
            await account.save();

            const duration = Date.now() - startTime;
            return {
                syncedChats: syncedChatsCount,
                syncedMessages: syncedMessagesCount,
                totalSpaces: spaces.length,
                duration: Math.round(duration / 1000)
            };

        } catch (error) {
            console.error(`Failed to sync chats for ${account.email}:`, error.message);
            throw error;
        }
    }

    // Helper function to get current user ID
    async getCurrentUserId(auth, email) {
        // Try Admin Directory API first
        const admin = google.admin({ version: "directory_v1", auth });
        try {
            const res = await admin.users.get({ userKey: email });
            return `users/${res.data.id}`;
        } catch (e) {
            console.warn(`Admin Directory API failed for ${email}: ${e.message}`);
            
            // Fallback: Try to extract from existing user mappings
            try {
                const existingUser = await UserMapping.findOne({ email });
                if (existingUser && existingUser.userId) {
                    console.log(`Using cached user ID for ${email}: users/${existingUser.userId}`);
                    return `users/${existingUser.userId}`;
                }
            } catch (dbError) {
                console.warn(`Failed to lookup user in database: ${dbError.message}`);
            }
            
            // Last fallback: return a predictable format
            console.warn(`Using fallback current user ID for ${email}`);
            return `users/current-user-${email.split('@')[0]}`;
        }
    }

    // PATCHED: Helper function to resolve user ID - NO MORE GOOGLE API CALLS!
    async resolveUserId(auth, userResourceName, spaceId = null, accountId = null) {
        // Handle different formats of userResourceName
        let userId = userResourceName;
        
        // If it's in format "users/123456789", extract the ID
        if (userResourceName.includes('/')) {
            userId = userResourceName.split('/').pop();
        }
        
        // Try database lookup (silent - no external API calls)
        try {
            const existingMapping = await UserMapping.getUserInfo(userId);
            if (existingMapping) {
                // Update last seen silently
                UserMapping.findOneAndUpdate(
                    { userId },
                    { $inc: { seenCount: 1 }, $set: { lastSeen: new Date() } }
                ).catch(() => {}); // Silent error handling
                
                return {
                    email: existingMapping.email,
                    displayName: existingMapping.displayName,
                    domain: existingMapping.domain
                };
            }
        } catch (dbError) {
            // Silent database error handling - continue to fallback
        }
        
        // If it's already an email, handle it directly
        if (userId.includes('@')) {
            const userInfo = {
                email: userId,
                displayName: userId.split('@')[0],
                domain: userId.split('@')[1]
            };
            
            // Store in database without awaiting (silent)
            if (accountId) {
                UserMapping.findOrCreateUser({
                    userId,
                    displayName: userInfo.displayName,
                    email: userInfo.email,
                    domain: userInfo.domain,
                    resolvedBy: 'email_direct',
                    discoveredByAccount: accountId,
                    confidence: 100,
                    originalUserResourceName: userResourceName
                }).catch(() => {}); // Silent error handling
            }
            
            return userInfo;
        }
        
        // ULTIMATE FALLBACK: Always return a valid user - never fail, never call Google APIs
        const shortId = userId.substring(0, 8);
        const fallbackInfo = {
            email: `user-${userId}@${DOMAIN}`,
            displayName: `User ${shortId}`,
            domain: DOMAIN
        };
        
        // Store the fallback user info in database without awaiting (silent)
        if (accountId) {
            UserMapping.findOrCreateUser({
                userId,
                displayName: fallbackInfo.displayName,
                email: fallbackInfo.email,
                domain: fallbackInfo.domain,
                resolvedBy: 'original_service_fallback',
                discoveredByAccount: accountId,
                confidence: 30,
                originalUserResourceName: userResourceName
            }).catch(() => {}); // Silent error handling
        }
        
        return fallbackInfo;
    }

    // Helper function to get initials from display name
    getInitials(displayName) {
        if (!displayName) return '??';
        
        const words = displayName.trim().split(/\s+/);
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }
        
        return words.slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join('');
    }

    // Helper function to format message time
    formatMessageTime(date) {
        const now = new Date();
        const messageDate = new Date(date);
        const diffInHours = (now - messageDate) / (1000 * 60 * 60);
        
        if (diffInHours < 24) {
            // Same day - show time
            return messageDate.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        } else if (diffInHours < 24 * 7) {
            // Same week - show day and time
            return messageDate.toLocaleDateString([], { 
                weekday: 'short',
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        } else {
            // Older - show date
            return messageDate.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    }

    // Cross-account user mapping enhancement
    async enhanceUserMappingsAcrossAccounts() {
        console.log('🔍 Analyzing cross-account user patterns...');
        
        try {
            // Get all accounts - ensure model is properly loaded
            const AccountModel = require('../db/Account');
            const accounts = await AccountModel.find({ deletedAt: { $exists: false } });
            if (accounts.length === 0) {
                console.log('⚠️  No accounts found for enhancement');
                return;
            }
            
            console.log(`📊 Analyzing ${accounts.length} accounts`);
            
            // Get all direct message chats with messages
            const allChats = await Chat.find({
                spaceType: 'DIRECT_MESSAGE',
                'messages.0': { $exists: true } // Has at least one message
            }).populate('account', 'email');
            
            console.log(`💬 Found ${allChats.length} direct message chats to analyze`);
            
            // Collect user ID statistics across accounts
            const userIdStats = new Map(); // userId -> { accounts: Map(accountEmail -> count), totalMessages: number }
            
            for (const chat of allChats) {
                const accountEmail = chat.account.email;
                
                for (const message of chat.messages) {
                    if (!message.senderId) continue;
                    
                    // Extract user ID from sender ID (e.g., "users/123456789" -> "123456789")
                    let userId = message.senderId;
                    if (userId.includes('/')) {
                        userId = userId.split('/').pop();
                    }
                    
                    if (!userIdStats.has(userId)) {
                        userIdStats.set(userId, {
                            accounts: new Map(),
                            totalMessages: 0,
                            isSentByCurrentUser: new Map() // accountEmail -> count of messages sent by current user
                        });
                    }
                    
                    const stats = userIdStats.get(userId);
                    
                    // Count messages per account
                    const currentCount = stats.accounts.get(accountEmail) || 0;
                    stats.accounts.set(accountEmail, currentCount + 1);
                    stats.totalMessages++;
                    
                    // Count how many times this user ID appears as "current user" in each account
                    if (message.isSentByCurrentUser) {
                        const currentUserCount = stats.isSentByCurrentUser.get(accountEmail) || 0;
                        stats.isSentByCurrentUser.set(accountEmail, currentUserCount + 1);
                    }
                }
            }
            
            console.log(`🔢 Collected statistics for ${userIdStats.size} unique user IDs`);
            
            // Analyze patterns and assign user IDs to accounts
            const userAccountAssignments = new Map(); // userId -> assignedAccountEmail
            const assignmentReasons = new Map(); // userId -> reason
            
            for (const [userId, stats] of userIdStats) {
                // Skip if this user only appears in one account
                if (stats.accounts.size === 1) {
                    continue;
                }
                
                // Find the account where this user ID is most frequently the "current user"
                let maxCurrentUserCount = 0;
                let assignedAccount = null;
                
                for (const [accountEmail, currentUserCount] of stats.isSentByCurrentUser) {
                    if (currentUserCount > maxCurrentUserCount) {
                        maxCurrentUserCount = currentUserCount;
                        assignedAccount = accountEmail;
                    }
                }
                
                // Only assign if we have strong confidence (user sent messages as current user)
                if (assignedAccount && maxCurrentUserCount > 0) {
                    userAccountAssignments.set(userId, assignedAccount);
                    assignmentReasons.set(userId, 
                        `Sent ${maxCurrentUserCount} messages as current user in ${assignedAccount}`);
                    
                    console.log(`✅ Assigned user ${userId.substring(0, 8)}... to ${assignedAccount} (${maxCurrentUserCount} current user messages)`);
                }
            }
            
            console.log(`🎯 Made ${userAccountAssignments.size} high-confidence user assignments`);
            
            // Update user mappings in database
            let updatedMappings = 0;
            
            for (const [userId, assignedEmail] of userAccountAssignments) {
                try {
                    // Find the account document to get additional info
                    const account = accounts.find(acc => acc.email === assignedEmail);
                    if (!account) continue;
                    
                    const displayName = assignedEmail.split('@')[0];
                    const domain = assignedEmail.split('@')[1];
                    
                    // Update or create user mapping
                    await UserMapping.findOneAndUpdate(
                        { userId },
                        {
                            $set: {
                                email: assignedEmail,
                                displayName,
                                domain,
                                resolvedBy: 'cross_account_analysis',
                                confidence: 90,
                                lastSeen: new Date(),
                                enhancementReason: assignmentReasons.get(userId)
                            },
                            $inc: {
                                seenCount: 1
                            },
                            $setOnInsert: {
                                userId,
                                createdAt: new Date()
                            }
                        },
                        { 
                            upsert: true, 
                            new: true 
                        }
                    );
                    
                    updatedMappings++;
                    
                } catch (error) {
                    console.error(`Failed to update mapping for user ${userId}:`, error.message);
                }
            }
            
            console.log(`💾 Updated ${updatedMappings} user mappings`);
            
            // Now update chat display names and message information
            console.log('🔄 Updating chat display names and message info...');
            
            let updatedChats = 0;
            let updatedMessages = 0;
            
            for (const chat of allChats) {
                let chatUpdated = false;
                
                // Update message sender information
                for (const message of chat.messages) {
                    if (!message.senderId) continue;
                    
                    let userId = message.senderId;
                    if (userId.includes('/')) {
                        userId = userId.split('/').pop();
                    }
                    
                    // Get updated user info
                    try {
                        const userMapping = await UserMapping.findOne({ userId });
                        if (userMapping) {
                            // Update message sender info if it changed
                            if (message.senderEmail !== userMapping.email || 
                                message.senderDisplayName !== userMapping.displayName) {
                                
                                message.senderEmail = userMapping.email;
                                message.senderDisplayName = userMapping.displayName;
                                message.senderDomain = userMapping.domain;
                                
                                // Update isSentByCurrentUser flag
                                const currentAccountEmail = chat.account.email;
                                message.isSentByCurrentUser = (userMapping.email === currentAccountEmail);
                                
                                updatedMessages++;
                                chatUpdated = true;
                            }
                        }
                    } catch (error) {
                        console.error(`Error updating message sender for user ${userId}:`, error.message);
                    }
                }
                
                // Update chat display name for direct messages
                if (chat.spaceType === 'DIRECT_MESSAGE' && chat.messages.length > 0) {
                    // Find the other participant (not the current account user)
                    const currentAccountEmail = chat.account.email;
                    const otherParticipants = chat.messages
                        .filter(msg => msg.senderEmail !== currentAccountEmail)
                        .map(msg => ({
                            email: msg.senderEmail,
                            displayName: msg.senderDisplayName
                        }));
                    
                    if (otherParticipants.length > 0) {
                        // Use the most common other participant as the chat display name
                        const participantCounts = new Map();
                        otherParticipants.forEach(p => {
                            const key = p.email;
                            participantCounts.set(key, (participantCounts.get(key) || 0) + 1);
                        });
                        
                        // Find the most frequent other participant
                        let mostFrequentParticipant = null;
                        let maxCount = 0;
                        
                        for (const [email, count] of participantCounts) {
                            if (count > maxCount) {
                                maxCount = count;
                                const participant = otherParticipants.find(p => p.email === email);
                                mostFrequentParticipant = participant;
                            }
                        }
                        
                        if (mostFrequentParticipant && 
                            chat.displayName !== mostFrequentParticipant.displayName &&
                            !mostFrequentParticipant.displayName.startsWith('User ')) { // Avoid generic names
                            
                            chat.displayName = mostFrequentParticipant.displayName;
                            chatUpdated = true;
                        }
                    }
                }
                
                // Save chat if updated
                if (chatUpdated) {
                    try {
                        await chat.save();
                        updatedChats++;
                    } catch (error) {
                        console.error(`Failed to save updated chat ${chat.spaceId}:`, error.message);
                    }
                }
            }
            
            console.log(`✅ Enhancement completed:`);
            console.log(`   - ${updatedMappings} user mappings enhanced`);
            console.log(`   - ${updatedChats} chats updated`);
            console.log(`   - ${updatedMessages} messages updated`);
            
        } catch (error) {
            console.error('❌ Cross-account enhancement failed:', error.message);
            throw error;
        }
    }

    // Helper function to fetch ALL messages with pagination
    async fetchAllMessages(chat, spaceId, pageSize = 100) {
        const allMessages = [];
        let pageToken = null;
        let pageCount = 0;
        
        try {
            do {
                pageCount++;
                console.log(`   📄 Fetching page ${pageCount} (${allMessages.length} messages so far)...`);
                
                const params = {
                    parent: spaceId,
                    pageSize: pageSize,
                };
                
                if (pageToken) {
                    params.pageToken = pageToken;
                }
                
                const response = await chat.spaces.messages.list(params);
                const pageMessages = response.data.messages || [];
                
                allMessages.push(...pageMessages);
                pageToken = response.data.nextPageToken;
                
                // Log progress for large chats
                if (pageMessages.length === pageSize && pageToken) {
                    console.log(`   📊 Page ${pageCount}: Got ${pageMessages.length} messages, continuing...`);
                } else if (pageMessages.length > 0) {
                    console.log(`   📊 Page ${pageCount}: Got ${pageMessages.length} messages (final page)`);
                }
                
                // Safety limit to prevent infinite loops
                if (pageCount >= 50) {
                    console.warn(`   ⚠️  Reached page limit (50 pages), stopping. Got ${allMessages.length} messages total.`);
                    break;
                }
                
                // Small delay between pages to respect rate limits
                if (pageToken) {
                    await this.sleep(100);
                }
                
            } while (pageToken);
            
            console.log(`   ✅ Fetched ${allMessages.length} total messages across ${pageCount} pages`);
            return allMessages;
            
        } catch (error) {
            console.error(`❌ Error fetching messages for space ${spaceId}:`, error.message);
            console.log(`   📊 Partial result: ${allMessages.length} messages before error`);
            return allMessages; // Return what we got so far
        }
    }

    // Helper function to add delay
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new ChatSyncService();
