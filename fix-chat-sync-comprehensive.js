require('dotenv').config();
const mongoose = require('mongoose');
const { google } = require('googleapis');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const keys = require('./dispatch.json');

const DOMAIN = "crossmilescarrier.com";

class ComprehensiveChatSyncFixer {
    constructor() {
        this.fixedChats = 0;
        this.processedParticipants = 0;
        this.recoveredChats = 0;
        this.userMappingsCreated = 0;
    }

    async connectDB() {
        await mongoose.connect(process.env.DB_URL_OFFICE, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to database');
    }

    async disconnectDB() {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }

    // Enhanced user resolution that creates proper mappings
    async enhancedUserResolution(auth, userResourceName, spaceId, accountId) {
        try {
            let userId = userResourceName;
            if (userResourceName.includes('/')) {
                userId = userResourceName.split('/').pop();
            }

            // Check existing mapping first
            let existingMapping = await UserMapping.getUserInfo(userResourceName);
            if (existingMapping && existingMapping.confidence >= 70) {
                console.log(`✅ Using existing mapping: ${userResourceName} -> ${existingMapping.displayName}`);
                return {
                    email: existingMapping.email,
                    displayName: existingMapping.displayName,
                    domain: existingMapping.domain,
                    userId: userResourceName
                };
            }

            // Try Google Admin Directory API
            const admin = google.admin({ version: "directory_v1", auth });
            let resolvedUser = null;

            try {
                console.log(`🔍 Resolving user via Admin Directory API: ${userResourceName}`);
                let userRes = await admin.users.get({ userKey: userId });
                
                if (userRes && userRes.data) {
                    const userData = userRes.data;
                    const email = userData.primaryEmail;
                    const displayName = userData.name?.fullName || 
                                      userData.name?.displayName || 
                                      userData.name?.givenName ||
                                      email.split('@')[0];

                    resolvedUser = {
                        email: email,
                        displayName: displayName,
                        domain: email.split('@')[1],
                        userId: userResourceName
                    };

                    // Create high-confidence mapping
                    await UserMapping.findOrCreateUser({
                        userId: userResourceName,
                        displayName: displayName,
                        email: email,
                        domain: email.split('@')[1],
                        resolvedBy: 'admin_directory_enhanced',
                        discoveredByAccount: accountId,
                        confidence: 95,
                        originalUserResourceName: userResourceName
                    });

                    this.userMappingsCreated++;
                    console.log(`✅ Created high-confidence mapping: ${userResourceName} -> ${displayName} (${email})`);
                    return resolvedUser;
                }
            } catch (apiError) {
                console.log(`⚠️ Admin Directory API failed for ${userResourceName}: ${apiError.message}`);
            }

            // Fallback with improved naming
            const shortId = userId.substring(0, 8);
            const fallbackDisplayName = `User ${shortId}`;
            const fallbackEmail = `user-${userId}@${DOMAIN}`;

            const fallbackUser = {
                email: fallbackEmail,
                displayName: fallbackDisplayName,
                domain: DOMAIN,
                userId: userResourceName
            };

            // Create fallback mapping only if we don't have a better one
            if (!existingMapping || existingMapping.confidence < 30) {
                await UserMapping.findOrCreateUser({
                    userId: userResourceName,
                    displayName: fallbackDisplayName,
                    email: fallbackEmail,
                    domain: DOMAIN,
                    resolvedBy: 'enhanced_fallback',
                    discoveredByAccount: accountId,
                    confidence: 35,
                    originalUserResourceName: userResourceName
                });

                this.userMappingsCreated++;
                console.log(`⚠️ Created fallback mapping: ${userResourceName} -> ${fallbackDisplayName}`);
            }

            return fallbackUser;

        } catch (error) {
            console.error(`❌ Failed to resolve user ${userResourceName}:`, error.message);
            
            // Ultimate fallback
            const shortId = userResourceName.substring(0, 8);
            return {
                email: `error-${shortId}@${DOMAIN}`,
                displayName: `User ${shortId}`,
                domain: DOMAIN,
                userId: userResourceName
            };
        }
    }

    // Comprehensive sync for a specific account
    async comprehensiveAccountSync(account) {
        console.log(`\n🔄 Starting comprehensive sync for: ${account.email}`);
        
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

        // Get ALL spaces with pagination
        let allSpaces = [];
        let nextPageToken = null;

        console.log(`📄 Fetching all spaces for ${account.email}...`);
        
        do {
            try {
                const spaceParams = { pageSize: 1000 };
                if (nextPageToken) {
                    spaceParams.pageToken = nextPageToken;
                }
                
                const spaceRes = await chat.spaces.list(spaceParams);
                const spaces = spaceRes.data.spaces || [];
                allSpaces.push(...spaces);
                nextPageToken = spaceRes.data.nextPageToken;
                
                console.log(`  📋 Fetched ${spaces.length} spaces (total so far: ${allSpaces.length})`);
            } catch (spaceListError) {
                console.error(`❌ Failed to fetch spaces page: ${spaceListError.message}`);
                break;
            }
        } while (nextPageToken);

        console.log(`📊 Found ${allSpaces.length} total spaces for ${account.email}`);

        // Process each space
        for (let i = 0; i < allSpaces.length; i++) {
            const space = allSpaces[i];
            try {
                console.log(`\n[${i + 1}/${allSpaces.length}] Processing space: ${space.name}`);
                
                const spaceId = space.name;
                const spaceType = space.spaceType;
                const displayName = space.displayName || 
                    (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");

                // Check if chat already exists
                let existingChat = await Chat.findOne({ spaceId, account: account._id });
                
                if (!existingChat) {
                    console.log(`🆕 New chat detected: ${spaceId}`);
                    this.recoveredChats++;
                }

                // Get space members with enhanced error handling
                let participants = [];
                try {
                    console.log(`👥 Fetching members for ${spaceId}...`);
                    const membersRes = await chat.spaces.members.list({ parent: spaceId });
                    const spaceMembers = membersRes?.data?.memberships || [];
                    
                    console.log(`  Found ${spaceMembers.length} members`);
                    
                    for (const member of spaceMembers) {
                        if (member.member && member.member.name) {
                            const memberId = member.member.name;
                            console.log(`  🔍 Resolving member: ${memberId}`);
                            
                            const memberInfo = await this.enhancedUserResolution(
                                auth, memberId, spaceId, account._id
                            );
                            
                            participants.push({
                                userId: memberId,
                                email: memberInfo.email,
                                displayName: memberInfo.displayName,
                                domain: memberInfo.domain,
                                role: member.role || 'ROLE_MEMBER',
                                state: member.state || 'JOINED'
                            });
                            
                            this.processedParticipants++;
                            console.log(`  ✅ Added participant: ${memberInfo.displayName} (${memberInfo.email})`);
                        }
                    }
                } catch (membersError) {
                    console.log(`⚠️ Failed to get members for ${spaceId}: ${membersError.message}`);
                    
                    // Fallback: extract participants from messages
                    try {
                        const messageRes = await chat.spaces.messages.list({
                            parent: spaceId,
                            pageSize: 50,
                        });
                        
                        const messages = messageRes.data.messages || [];
                        const uniqueSenders = new Set();
                        
                        messages.forEach(msg => {
                            if (msg.sender && msg.sender.name) {
                                uniqueSenders.add(msg.sender.name);
                            }
                        });
                        
                        console.log(`  📨 Found ${uniqueSenders.size} unique senders in messages`);
                        
                        for (const senderId of uniqueSenders) {
                            const senderInfo = await this.enhancedUserResolution(
                                auth, senderId, spaceId, account._id
                            );
                            
                            participants.push({
                                userId: senderId,
                                email: senderInfo.email,
                                displayName: senderInfo.displayName,
                                domain: senderInfo.domain,
                                role: 'ROLE_MEMBER',
                                state: 'JOINED'
                            });
                            
                            this.processedParticipants++;
                        }
                    } catch (fallbackError) {
                        console.log(`⚠️ Fallback participant detection also failed: ${fallbackError.message}`);
                    }
                }

                // Get messages for the chat
                let messages = [];
                try {
                    const messageRes = await chat.spaces.messages.list({
                        parent: spaceId,
                        pageSize: 100,
                    });
                    
                    const rawMessages = messageRes.data.messages || [];
                    console.log(`  📨 Found ${rawMessages.length} messages`);
                    
                    for (const msg of rawMessages) {
                        const senderId = msg.sender?.name || "Unknown";
                        const senderInfo = await this.enhancedUserResolution(
                            auth, senderId, spaceId, account._id
                        );
                        
                        const isSentByCurrentUser = senderInfo.email === account.email;
                        
                        messages.push({
                            messageId: msg.name,
                            text: msg.text || "(no text)",
                            senderId,
                            senderEmail: senderInfo.email,
                            senderDisplayName: senderInfo.displayName,
                            senderDomain: senderInfo.domain,
                            isSentByCurrentUser,
                            createTime: new Date(msg.createTime),
                            attachments: []
                        });
                    }
                } catch (messagesError) {
                    console.log(`⚠️ Failed to get messages for ${spaceId}: ${messagesError.message}`);
                }

                // Create or update chat
                if (existingChat) {
                    // Update existing chat with better participant info
                    console.log(`🔄 Updating existing chat: ${spaceId}`);
                    
                    existingChat.participants = participants;
                    existingChat.displayName = displayName;
                    
                    // Add new messages if any
                    const existingMessageIds = new Set(existingChat.messages.map(m => m.messageId));
                    const newMessages = messages.filter(m => !existingMessageIds.has(m.messageId));
                    
                    if (newMessages.length > 0) {
                        existingChat.messages.push(...newMessages);
                        console.log(`  📨 Added ${newMessages.length} new messages`);
                    }
                    
                    existingChat.messageCount = existingChat.messages.length;
                    existingChat.lastMessageTime = messages.length > 0 ? 
                        new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                        existingChat.lastMessageTime;
                    
                    await existingChat.save();
                    this.fixedChats++;
                    console.log(`  ✅ Updated chat with ${participants.length} participants`);
                } else {
                    // Create new chat
                    console.log(`🆕 Creating new chat: ${spaceId}`);
                    
                    const newChat = new Chat({
                        account: account._id,
                        spaceId,
                        displayName,
                        spaceType,
                        participants,
                        messages,
                        messageCount: messages.length,
                        lastMessageTime: messages.length > 0 ? 
                            new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                            new Date()
                    });
                    
                    await newChat.save();
                    this.fixedChats++;
                    console.log(`  ✅ Created chat with ${participants.length} participants and ${messages.length} messages`);
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (spaceError) {
                console.error(`❌ Error processing space ${space.name}: ${spaceError.message}`);
            }
        }

        // Update account sync time
        account.lastChatSync = new Date();
        await account.save();
        
        console.log(`✅ Completed sync for ${account.email}`);
    }

    async run() {
        try {
            console.log('🚀 COMPREHENSIVE CHAT SYNC FIX');
            console.log('=' .repeat(50));
            
            await this.connectDB();
            
            // Get all accounts
            const accounts = await Account.find({ 
                deletedAt: { $exists: false }
            });
            
            console.log(`📧 Found ${accounts.length} accounts to sync`);
            
            for (const account of accounts) {
                await this.comprehensiveAccountSync(account);
                
                // Delay between accounts
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Final summary
            console.log('\n🎉 COMPREHENSIVE SYNC COMPLETE!');
            console.log('=' .repeat(50));
            console.log(`✅ Fixed chats: ${this.fixedChats}`);
            console.log(`🆕 Recovered missing chats: ${this.recoveredChats}`);
            console.log(`👥 Processed participants: ${this.processedParticipants}`);
            console.log(`🆔 User mappings created: ${this.userMappingsCreated}`);
            
            await this.disconnectDB();
            
        } catch (error) {
            console.error('❌ Comprehensive sync failed:', error);
            await this.disconnectDB();
        }
    }
}

// Run the comprehensive fix
const fixer = new ComprehensiveChatSyncFixer();
fixer.run();
