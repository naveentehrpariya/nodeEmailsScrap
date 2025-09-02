const { google } = require('googleapis');
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const keys = require('./dispatch.json');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/emailscrap');

async function completeChatsAndUsersfix() {
    console.log('🔧 COMPLETE CHAT SYNC & USER RESOLUTION FIX\n');
    
    const testUserEmail = 'naveendev@crossmilescarrier.com';
    
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ];
    
    try {
        // Get account
        const account = await Account.findOne({ email: testUserEmail });
        if (!account) {
            console.log('❌ Account not found:', testUserEmail);
            return;
        }
        
        console.log(`📧 Account: ${account.email} (${account._id})`);
        
        // Setup auth
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            testUserEmail
        );
        
        const chat = google.chat({ version: 'v1', auth });
        const admin = google.admin({ version: 'directory_v1', auth });
        
        console.log('\n🌐 STEP 1: Get ALL spaces from Google Chat API');
        const spacesRes = await chat.spaces.list();
        const apiSpaces = spacesRes.data.spaces || [];
        console.log(`Found ${apiSpaces.length} spaces in Google Chat API`);
        
        // Show all API spaces
        console.log('\\n📋 All API Spaces:');
        apiSpaces.forEach((space, i) => {
            console.log(`  ${i+1}. ${space.name} - "${space.displayName || '(No name)'}" (${space.spaceType})`);
        });
        
        console.log('\\n🗂️ STEP 2: Check existing spaces in database');
        const dbChats = await Chat.find({ account: account._id });
        const dbSpaceIds = new Set(dbChats.map(c => c.spaceId));
        console.log(`Found ${dbChats.length} chats in database`);
        
        console.log('\\n📋 Database Spaces:');
        dbChats.forEach((chat, i) => {
            console.log(`  ${i+1}. ${chat.spaceId} - "${chat.displayName}" (${chat.spaceType}) - ${chat.messageCount} msgs`);
        });
        
        // Find ALL missing spaces
        const missingSpaces = apiSpaces.filter(s => !dbSpaceIds.has(s.name));
        const extraSpaces = dbChats.filter(c => !apiSpaces.map(s => s.name).includes(c.spaceId));
        
        console.log(`\\n🔍 DIFFERENCES:`);
        console.log(`  ❌ Missing from DB: ${missingSpaces.length} spaces`);
        console.log(`  ➕ Extra in DB: ${extraSpaces.length} spaces`);
        
        if (missingSpaces.length > 0) {
            console.log('\\n  🚨 MISSING SPACES:');
            missingSpaces.forEach((space, i) => {
                console.log(`    ${i+1}. ${space.name} - "${space.displayName || '(No name)'}" (${space.spaceType})`);
            });
        }
        
        console.log('\\n🔄 STEP 3: Sync ALL missing spaces with ENHANCED user resolution');
        let newChatsCount = 0;
        let newMessagesCount = 0;
        let improvedUserMappings = 0;
        
        // Enhanced user resolution function
        async function resolveUserWithAllMethods(senderId) {
            console.log(`      🔍 Resolving user: ${senderId}`);
            
            // Check existing mapping first
            let existingInfo = await UserMapping.getUserInfo(senderId);
            if (existingInfo) {
                console.log(`      ✅ Found existing mapping: ${existingInfo.displayName} (${existingInfo.email})`);
                return existingInfo;
            }
            
            // Extract numeric ID for alternate lookups
            const numericId = senderId.includes('/') ? senderId.split('/').pop() : senderId;
            
            // Method 1: Try Google Admin Directory API (most accurate)
            try {
                const userRes = await admin.users.get({ userKey: numericId });
                if (userRes.data) {
                    const userData = userRes.data;
                    const email = userData.primaryEmail;
                    const displayName = userData.name?.fullName || userData.name?.givenName || email.split('@')[0];
                    
                    const resolvedInfo = {
                        email: email,
                        displayName: displayName,
                        domain: email.split('@')[1]
                    };
                    
                    // Create high-confidence mapping
                    await UserMapping.findOrCreateUser({
                        userId: senderId,
                        displayName: resolvedInfo.displayName,
                        email: resolvedInfo.email,
                        domain: resolvedInfo.domain,
                        resolvedBy: 'admin_directory_enhanced',
                        discoveredByAccount: account._id,
                        confidence: 95,
                        originalUserResourceName: senderId
                    });
                    
                    console.log(`      🎯 Admin API resolved: ${resolvedInfo.displayName} (${resolvedInfo.email})`);
                    improvedUserMappings++;
                    return resolvedInfo;
                }
            } catch (adminError) {
                console.log(`      ⚠️ Admin API failed: ${adminError.message.split('.')[0]}`);
            }
            
            // Method 2: Try alternate ID formats
            const alternateIds = [
                senderId,
                numericId,
                `users/${numericId}`,
                senderId.replace('users/', '')
            ];
            
            for (const altId of alternateIds) {
                if (altId !== senderId) {  // Skip the original ID we already tried
                    try {
                        const userRes = await admin.users.get({ userKey: altId });
                        if (userRes.data) {
                            const userData = userRes.data;
                            const email = userData.primaryEmail;
                            const displayName = userData.name?.fullName || userData.name?.givenName || email.split('@')[0];
                            
                            const resolvedInfo = {
                                email: email,
                                displayName: displayName,
                                domain: email.split('@')[1]
                            };
                            
                            // Create mapping
                            await UserMapping.findOrCreateUser({
                                userId: senderId,
                                displayName: resolvedInfo.displayName,
                                email: resolvedInfo.email,
                                domain: resolvedInfo.domain,
                                resolvedBy: 'admin_directory_alt',
                                discoveredByAccount: account._id,
                                confidence: 90,
                                originalUserResourceName: senderId
                            });
                            
                            console.log(`      🔍 Alt ID resolved: ${resolvedInfo.displayName} (${resolvedInfo.email}) via ${altId}`);
                            improvedUserMappings++;
                            return resolvedInfo;
                        }
                    } catch (altError) {
                        // Continue trying other methods
                    }
                }
            }
            
            // Method 3: Create smart fallback based on known patterns
            const shortId = numericId.substring(0, 8);
            let fallbackEmail, fallbackName;
            
            // Check if this looks like a real user ID (long numeric)
            if (/^\\d{18,}$/.test(numericId)) {
                // Looks like a real Google user ID
                fallbackEmail = `user.${shortId}@crossmilescarrier.com`;
                fallbackName = `User ${shortId}`;
            } else {
                // Other fallback
                fallbackEmail = `unknown-${shortId}@crossmilescarrier.com`;
                fallbackName = `Unknown ${shortId}`;
            }
            
            const fallbackInfo = {
                email: fallbackEmail,
                displayName: fallbackName,
                domain: 'crossmilescarrier.com'
            };
            
            // Create fallback mapping
            await UserMapping.findOrCreateUser({
                userId: senderId,
                displayName: fallbackInfo.displayName,
                email: fallbackInfo.email,
                domain: fallbackInfo.domain,
                resolvedBy: 'smart_fallback',
                discoveredByAccount: account._id,
                confidence: 30,
                originalUserResourceName: senderId
            });
            
            console.log(`      💭 Smart fallback: ${fallbackInfo.displayName} (${fallbackInfo.email})`);
            return fallbackInfo;
        }
        
        // Process all missing spaces
        for (const space of missingSpaces) {
            try {
                const spaceId = space.name;
                const spaceType = space.spaceType;
                const displayName = space.displayName || 
                    (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");
                
                console.log(`\\n  📥 Syncing: "${displayName}" (${spaceType}) - ${spaceId}`);
                
                // Get messages for this space
                const messageRes = await chat.spaces.messages.list({
                    parent: spaceId,
                    pageSize: 100
                });
                
                const rawMessages = messageRes.data.messages || [];
                const messages = [];
                
                console.log(`     📨 Processing ${rawMessages.length} messages with enhanced user resolution`);
                
                // Get unique sender IDs first
                const uniqueSenders = [...new Set(rawMessages.map(m => m.sender?.name).filter(Boolean))];
                console.log(`     👥 Found ${uniqueSenders.length} unique senders: ${uniqueSenders.join(', ')}`);
                
                // Resolve all users first
                const userResolutions = new Map();
                for (const senderId of uniqueSenders) {
                    const userInfo = await resolveUserWithAllMethods(senderId);
                    userResolutions.set(senderId, userInfo);
                }
                
                // Process messages with resolved user info
                for (const m of rawMessages) {
                    const senderId = m.sender?.name || "Unknown";
                    const senderInfo = userResolutions.get(senderId) || {
                        email: 'unknown@unknown',
                        displayName: 'Unknown User',
                        domain: 'unknown'
                    };
                    
                    const isSentByCurrentUser = senderInfo.email === account.email;
                    
                    messages.push({
                        messageId: m.name,
                        text: m.text || "(no text)",
                        senderId,
                        senderEmail: senderInfo.email,
                        senderDisplayName: senderInfo.displayName,
                        senderDomain: senderInfo.domain,
                        attachments: [], // Will be processed later if needed
                        isSentByCurrentUser,
                        isExternal: !senderInfo.email.endsWith('@crossmilescarrier.com'),
                        createTime: new Date(m.createTime)
                    });
                }
                
                // Create new chat
                const newChat = new Chat({
                    account: account._id,
                    spaceId,
                    displayName,
                    spaceType,
                    participants: [],
                    messages,
                    messageCount: messages.length,
                    lastMessageTime: messages.length > 0 ? 
                        new Date(Math.max(...messages.map(m => new Date(m.createTime)))) : 
                        new Date()
                });
                
                await newChat.save();
                newChatsCount++;
                newMessagesCount += messages.length;
                
                console.log(`     ✅ Created chat with ${messages.length} messages`);
                
                // Show sample message senders for verification
                if (messages.length > 0) {
                    const senderSample = messages.slice(0, 3).map(m => 
                        `${m.senderDisplayName} (${m.senderEmail})`
                    );
                    console.log(`     👤 Sample senders: ${senderSample.join(', ')}`);
                }
                
            } catch (spaceError) {
                console.log(`     ❌ Failed to sync ${space.name}: ${spaceError.message}`);
            }
        }
        
        console.log('\\n🔄 STEP 4: Update existing chats with better user resolution');
        
        // Update existing chats with improved user mappings
        const existingChats = await Chat.find({ account: account._id, spaceType: 'DIRECT_MESSAGE' });
        let updatedMessages = 0;
        
        for (const chat of existingChats) {
            let chatUpdated = false;
            
            for (const message of chat.messages) {
                const senderId = message.senderId;
                if (senderId && (message.senderDisplayName === 'Unknown' || 
                    message.senderDisplayName.startsWith('User ') ||
                    message.senderEmail.startsWith('user-'))) {
                    
                    // Try to get better user info
                    const betterInfo = await resolveUserWithAllMethods(senderId);
                    
                    if (betterInfo && betterInfo.email !== message.senderEmail) {
                        console.log(`      🔄 Updating message sender: ${senderId} -> ${betterInfo.displayName} (${betterInfo.email})`);
                        message.senderEmail = betterInfo.email;
                        message.senderDisplayName = betterInfo.displayName;
                        message.senderDomain = betterInfo.domain;
                        chatUpdated = true;
                        updatedMessages++;
                    }
                }
            }
            
            if (chatUpdated) {
                await chat.save();
            }
        }
        
        console.log('\\n✅ STEP 5: Final summary and verification');
        
        // Get final counts
        const finalChats = await Chat.find({ account: account._id });
        const finalMappings = await UserMapping.find({});
        
        console.log(`\\n🎉 COMPREHENSIVE SYNC COMPLETED!`);
        console.log(`  📊 Results:`);
        console.log(`    • New chats synced: ${newChatsCount}`);
        console.log(`    • New messages synced: ${newMessagesCount}`);
        console.log(`    • Improved user mappings: ${improvedUserMappings}`);
        console.log(`    • Updated existing messages: ${updatedMessages}`);
        console.log(`    • Total chats now: ${finalChats.length}`);
        console.log(`    • Total user mappings: ${finalMappings.length}`);
        
        console.log('\\n🔍 Final chat breakdown:');
        const dmChats = finalChats.filter(c => c.spaceType === 'DIRECT_MESSAGE');
        const groupChats = finalChats.filter(c => c.spaceType !== 'DIRECT_MESSAGE');
        
        console.log(`  💬 Direct Messages: ${dmChats.length}`);
        dmChats.forEach((chat, i) => {
            const senders = [...new Set(chat.messages.map(m => m.senderDisplayName))];
            console.log(`    ${i+1}. ${chat.displayName} - ${chat.messageCount} msgs - Participants: ${senders.join(', ')}`);
        });
        
        console.log(`\\n  👥 Group Spaces: ${groupChats.length}`);
        groupChats.forEach((chat, i) => {
            console.log(`    ${i+1}. ${chat.displayName} - ${chat.messageCount} msgs`);
        });
        
        console.log('\\n💡 NEXT: Test the chat list API to see all chats with proper user names!');
        
        // Update account last sync time
        account.lastChatSync = new Date();
        await account.save();
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
    }
    
    mongoose.disconnect();
}

// Run the comprehensive fix
completeChatsAndUsersfix().catch(console.error);
