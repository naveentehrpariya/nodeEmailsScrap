// This is an optimized version of chatSyncService.js that minimizes user resolution API calls
const { google } = require('googleapis');
const mediaProcessingService = require('./mediaProcessingService');
const Chat = require('../db/Chat');
const Account = require('../db/Account');
const UserMapping = require('../db/UserMapping');
const keys = require('../dispatch.json');

// Company domain for user fallbacks
const DOMAIN = "crossmilescarrier.com";

class OptimizedChatSyncService {
    
    // Create user mapping for the syncing account itself
    async createSyncAccountMapping(account) {
        try {
            const displayName = account.email.split('@')[0];
            const domain = account.email.split('@')[1];
            
            await UserMapping.findOrCreateUser({
                userId: account.email,
                displayName: displayName,
                email: account.email,
                domain: domain,
                resolvedBy: 'sync_account',
                discoveredByAccount: account._id,
                confidence: 100,
                originalUserResourceName: account.email
            });
            
            console.log(`✅ Created sync account mapping: ${account.email} -> ${displayName}`);
        } catch (error) {
            console.error(`Failed to create sync account mapping for ${account.email}:`, error.message);
        }
    }

    // Determine proper chat display name for Direct Messages
    getDirectMessageDisplayName(space, messages, currentUserEmail) {
        // For direct messages, find the OTHER participant
        if (space.spaceType !== 'DIRECT_MESSAGE') {
            return space.displayName || '(Unnamed Space)';
        }

        // Analyze message senders to find the other person
        const senderCounts = {};
        const senderDetails = {};
        
        messages.forEach(msg => {
            if (msg.senderId) {
                senderCounts[msg.senderId] = (senderCounts[msg.senderId] || 0) + 1;
                senderDetails[msg.senderId] = {
                    displayName: msg.senderDisplayName,
                    email: msg.senderEmail
                };
            }
        });

        // Find the most frequent sender who is NOT the current user
        const currentUserIds = [currentUserEmail, `users/current-user-${currentUserEmail.split('@')[0]}`];
        
        let otherPersonId = null;
        let maxMessages = 0;
        
        for (const senderId of Object.keys(senderCounts)) {
            if (!currentUserIds.includes(senderId) && senderCounts[senderId] > maxMessages) {
                otherPersonId = senderId;
                maxMessages = senderCounts[senderId];
            }
        }

        if (otherPersonId && senderDetails[otherPersonId]) {
            return senderDetails[otherPersonId].displayName;
        }

        return '(Direct Message)'; // Fallback
    }

    // Get participants for the chat
    async getChatParticipants(space, messages, currentUserEmail) {
        if (space.spaceType !== 'DIRECT_MESSAGE') {
            return []; // For now, don't set participants for group chats
        }

        // For direct messages, find the OTHER person
        const senderCounts = {};
        const senderDetails = {};
        
        messages.forEach(msg => {
            if (msg.senderId) {
                senderCounts[msg.senderId] = (senderCounts[msg.senderId] || 0) + 1;
                senderDetails[msg.senderId] = {
                    displayName: msg.senderDisplayName,
                    email: msg.senderEmail
                };
            }
        });

        const currentUserIds = [currentUserEmail];
        
        for (const senderId of Object.keys(senderCounts)) {
            if (!currentUserIds.includes(senderId) && senderDetails[senderId]) {
                // Try to get better name from user mapping
                try {
                    const userMapping = await UserMapping.findOne({ userId: senderId });
                    const displayName = userMapping?.displayName || senderDetails[senderId].displayName;
                    const email = userMapping?.email || senderDetails[senderId].email;
                    
                    return [{
                        userId: senderId,
                        email: email,
                        displayName: displayName
                    }];
                } catch (error) {
                    return [{
                        userId: senderId,
                        email: senderDetails[senderId].email,
                        displayName: senderDetails[senderId].displayName
                    }];
                }
            }
        }

        return []; // No other participants found
    }

    // Main sync method for all accounts
    async syncAllChats() {
        try {
            const accounts = await Account.find({ 
                deletedAt: { $exists: false }
            });
            console.log(`🔄 Starting chat sync for ${accounts.length} accounts...`);
            
            let totalSyncedChats = 0;
            let totalSyncedMessages = 0;
            const results = [];
            
            for (const account of accounts) {
                console.log(`📧 Syncing chats for ${account.email}...`);
                try {
                    const result = await this.syncAccountChats(account);
                    results.push({ 
                        email: account.email, 
                        ...result 
                    });
                    
                    totalSyncedChats += result.syncedChats;
                    totalSyncedMessages += result.syncedMessages;
                    
                    console.log(`✅ Synced ${result.syncedChats} chats with ${result.syncedMessages} messages for ${account.email} in ${result.duration}s`);
                } catch (accountError) {
                    console.error(`❌ Failed to sync chats for ${account.email}:`, accountError.message);
                    results.push({ 
                        email: account.email, 
                        error: accountError.message 
                    });
                }
                
                // Small delay between accounts to avoid rate limiting
                await this.sleep(2000);
            }

                        // Enhance user mappings across all accounts after sync
            await this.enhanceUserMappingsAcrossAccounts();
            
            console.log(`🎉 Chat sync completed! Total: ${totalSyncedChats} chats, ${totalSyncedMessages} messages`);
            console.log(`🔄 Media attachments preserved during sync. All media should display correctly.`);
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
            // Create user mapping for the syncing account
            await this.createSyncAccountMapping(account);

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
            
            // OPTIMIZATION: Don't call getCurrentUserId for every sync
            // Just use the account email to identify the current user
            const currentUserEmail = account.email;

            // Fetch spaces (chats)
            const spaceRes = await chat.spaces.list();
            const spaces = spaceRes.data.spaces || [];

            let syncedChatsCount = 0;
            let syncedMessagesCount = 0;

            // Create a cache for user resolution to minimize API calls
            const userCache = new Map();

            for (const space of spaces) {
                try {
                    const spaceId = space.name;
                    const spaceType = space.spaceType;
                    // Display name will be set after processing messages
                    let displayName = space.displayName || 
                        (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");

                    // Fetch messages for this space
                    console.log(`🔍 Fetching messages for space: ${spaceId} (${displayName})`);
                    const messageRes = await chat.spaces.messages.list({
                        parent: spaceId,
                        pageSize: 100,
                    });

                    const rawMessages = messageRes.data.messages || [];
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
                        
                        // OPTIMIZATION: Use fast user resolution with caching
                        const senderInfo = await this.fastResolveUserId(auth, senderId, userCache, account._id);
                        
                        // Simple check if this is the current user based on email
                        const isSentByCurrentUser = senderInfo.email === currentUserEmail;
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
                                    sourceId: att.attachmentDataRef?.resourceName || 
                                            att.driveDataRef?.resourceName || 
                                            `${m.name}_attachment_${Math.random().toString(36).substring(2, 10)}`,
                                    mediaType: 'unknown'
                                }));
                            }
                        }

                        // Determine message alignment and styling  
                        const align = isSentByCurrentUser ? 'right' : 'left';
                        const bubbleClass = isSentByCurrentUser ? 'sent' : 'received';
                        const senderInitials = this.getInitials(senderInfo.displayName);
                        const formattedTime = this.formatMessageTime(new Date(fullMessageData.createTime));

                        const message = {
                            messageId: fullMessageData.name,
                            text: fullMessageData.text || '(no text)',
                            senderId,
                            senderEmail: senderInfo.email,
                            senderDisplayName: senderInfo.displayName,
                            senderDomain: senderInfo.domain,
                            attachments: processedAttachments,
                            isSentByCurrentUser,
                            isExternal,
                            createTime: new Date(fullMessageData.createTime),
                            // Enhanced UI properties
                            align,
                            bubbleClass,
                            senderInitials,
                            formattedTime,
                            hasAttachments: processedAttachments.length > 0,
                            hasMedia: processedAttachments.some(att => att.isImage || att.isVideo),
                            hasDocuments: processedAttachments.some(att => att.isDocument)
                        };

                        messages.push(message);
                    }

                    // Now that we have processed messages, set the proper display name for direct messages
                    displayName = this.getDirectMessageDisplayName(space, messages, currentUserEmail);
                    
                    console.log(`✅ Processed ${messages.length} messages with attachments for space ${displayName}`);

                    // Check if this chat exists in our database
                    let chatDoc = await Chat.findOne({ spaceId, account: account._id });

                    if (chatDoc) {
                        console.log(`🔄 Updating existing chat ${spaceId} with ${messages.length} messages`);
                        
                        // Find new messages by messageId
                        const existingMessageIds = chatDoc.messages.map(m => m.messageId);
                        const newMessages = messages.filter(m => !existingMessageIds.includes(m.messageId));
                        
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
                            participants: await this.getChatParticipants(space, messages, currentUserEmail),
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

    // ULTRA-OPTIMIZED: Instant user resolution - NO Google API calls, NO errors
    async fastResolveUserId(auth, userResourceName, userCache, accountId = null) {
        // Handle different formats of userResourceName
        let userId = userResourceName;
        
        // If it's in format "users/123456789", extract the ID
        if (userResourceName.includes('/')) {
            userId = userResourceName.split('/').pop();
        }
        
        // Check cache first
        if (userCache.has(userId)) {
            return userCache.get(userId);
        }
        
        // Try database lookup (silent - no external API calls)
        try {
            const existingMapping = await UserMapping.getUserInfo(userId);
            if (existingMapping) {
                // Update last seen silently (don't await this)
                UserMapping.findOneAndUpdate(
                    { userId },
                    { $inc: { seenCount: 1 }, $set: { lastSeen: new Date() } }
                ).catch(() => {}); // Silent error handling
                
                const userInfo = {
                    email: existingMapping.email,
                    displayName: existingMapping.displayName,
                    domain: existingMapping.domain
                };
                
                // Add to cache
                userCache.set(userId, userInfo);
                return userInfo;
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
            
            // Add to cache
            userCache.set(userId, userInfo);
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
                resolvedBy: 'fast_sync_fallback',
                discoveredByAccount: accountId,
                confidence: 30,
                originalUserResourceName: userResourceName
            }).catch(() => {}); // Silent error handling
        }
        
        // Add to cache
        userCache.set(userId, fallbackInfo);
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


    // Enhanced method to cross-reference user mappings across accounts after sync
    async enhanceUserMappingsAcrossAccounts() {
        try {
            console.log('🔄 Enhancing user mappings across all accounts...');
            
            const accounts = await Account.find({});
            const allChats = await Chat.find({ spaceType: 'DIRECT_MESSAGE' });
            const userMappings = await UserMapping.find({});
            
            // Strategy: If a Google user ID appears frequently in one account's chats 
            // as "current user", it likely belongs to that account
            const googleUserIdAnalysis = {};
            
            // Analyze message patterns across all chats
            for (const chat of allChats) {
                const account = await Account.findById(chat.account);
                if (!account) continue;
                
                chat.messages.forEach(msg => {
                    if (msg.senderId && msg.senderId.startsWith('users/')) {
                        if (!googleUserIdAnalysis[msg.senderId]) {
                            googleUserIdAnalysis[msg.senderId] = {
                                totalMessages: 0,
                                accountStats: {},
                                currentUserCounts: {}
                            };
                        }
                        
                        googleUserIdAnalysis[msg.senderId].totalMessages++;
                        
                        if (!googleUserIdAnalysis[msg.senderId].accountStats[account.email]) {
                            googleUserIdAnalysis[msg.senderId].accountStats[account.email] = 0;
                        }
                        googleUserIdAnalysis[msg.senderId].accountStats[account.email]++;
                        
                        // Track isSentByCurrentUser patterns
                        if (msg.isSentByCurrentUser) {
                            if (!googleUserIdAnalysis[msg.senderId].currentUserCounts[account.email]) {
                                googleUserIdAnalysis[msg.senderId].currentUserCounts[account.email] = 0;
                            }
                            googleUserIdAnalysis[msg.senderId].currentUserCounts[account.email]++;
                        }
                    }
                });
            }
            
            // Create mappings based on analysis
            let updatedMappings = 0;
            
            for (const [userId, analysis] of Object.entries(googleUserIdAnalysis)) {
                // Find the account where this user ID appears most as "current user"
                let bestAccount = null;
                let maxCurrentUserMessages = 0;
                
                for (const [accountEmail, count] of Object.entries(analysis.currentUserCounts)) {
                    if (count > maxCurrentUserMessages) {
                        maxCurrentUserMessages = count;
                        bestAccount = accountEmail;
                    }
                }
                
                // If no clear "current user" pattern, use the account with most messages
                if (!bestAccount) {
                    let maxMessages = 0;
                    for (const [accountEmail, count] of Object.entries(analysis.accountStats)) {
                        if (count > maxMessages) {
                            maxMessages = count;
                            bestAccount = accountEmail;
                        }
                    }
                }
                
                if (bestAccount) {
                    const displayName = bestAccount.split('@')[0];
                    const domain = bestAccount.split('@')[1];
                    
                    // Update the user mapping
                    try {
                        await UserMapping.findOneAndUpdate(
                            { userId: userId },
                            {
                                displayName: displayName,
                                email: bestAccount,
                                domain: domain,
                                resolvedBy: 'cross_account_analysis',
                                confidence: maxCurrentUserMessages > 0 ? 90 : 70,
                                updatedAt: new Date()
                            },
                            { upsert: true, new: true }
                        );
                        
                        console.log(`✅ Enhanced mapping: ${userId} -> ${displayName} (${bestAccount})`);
                        updatedMappings++;
                    } catch (error) {
                        console.error(`Failed to update mapping for ${userId}:`, error.message);
                    }
                }
            }
            
            console.log(`✅ Enhanced ${updatedMappings} user mappings`);
            
            // Now update all chat display names and message sender names with enhanced mappings
            let updatedChats = 0;
            const enhancedMappings = await UserMapping.find({});
            const mappingLookup = {};
            enhancedMappings.forEach(mapping => {
                mappingLookup[mapping.userId] = mapping;
            });
            
            for (const chat of allChats) {
                let updated = false;
                const account = await Account.findById(chat.account);
                if (!account) continue;
                
                // Update message sender names
                chat.messages.forEach(message => {
                    if (message.senderId && mappingLookup[message.senderId]) {
                        const realInfo = mappingLookup[message.senderId];
                        
                        if (message.senderDisplayName !== realInfo.displayName) {
                            message.senderDisplayName = realInfo.displayName;
                            message.senderEmail = realInfo.email;
                            message.senderDomain = realInfo.domain;
                            message.isSentByCurrentUser = (realInfo.email === account.email);
                            updated = true;
                        }
                    }
                });
                
                // Update Direct Message chat display names
                if (chat.spaceType === 'DIRECT_MESSAGE') {
                    // Find the OTHER person in this conversation
                    const otherParticipants = new Set();
                    
                    chat.messages.forEach(msg => {
                        if (msg.senderId && mappingLookup[msg.senderId]) {
                            const realInfo = mappingLookup[msg.senderId];
                            if (realInfo.email !== account.email) {
                                otherParticipants.add({
                                    userId: msg.senderId,
                                    email: realInfo.email,
                                    displayName: realInfo.displayName
                                });
                            }
                        }
                    });
                    
                    if (otherParticipants.size > 0) {
                        const otherPerson = Array.from(otherParticipants)[0];
                        
                        if (chat.displayName !== otherPerson.displayName) {
                            chat.displayName = otherPerson.displayName;
                            chat.participants = [{
                                userId: otherPerson.userId,
                                email: otherPerson.email,
                                displayName: otherPerson.displayName
                            }];
                            updated = true;
                        }
                    }
                }
                
                if (updated) {
                    await chat.save();
                    updatedChats++;
                }
            }
            
            console.log(`✅ Updated ${updatedChats} chats with enhanced user mappings`);
            
        } catch (error) {
            console.error('Failed to enhance user mappings:', error.message);
        }
    }

        // Helper function to add delay
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new OptimizedChatSyncService();
