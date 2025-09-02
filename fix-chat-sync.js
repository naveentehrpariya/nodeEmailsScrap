const { google } = require('googleapis');
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');
const keys = require('./dispatch.json');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/emailscrap');

async function fixChatSync() {
    console.log('🔧 COMPREHENSIVE CHAT SYNC FIX\n');
    
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
        
        console.log('\n🌐 STEP 1: Fetch all spaces from Google Chat API');
        const spacesRes = await chat.spaces.list();
        const apiSpaces = spacesRes.data.spaces || [];
        console.log(`Found ${apiSpaces.length} spaces in Google Chat API`);
        
        console.log('\n📊 STEP 2: Check existing spaces in database');
        const dbChats = await Chat.find({ account: account._id });
        const dbSpaceIds = new Set(dbChats.map(c => c.spaceId));
        console.log(`Found ${dbChats.length} chats in database`);
        
        // Find missing spaces
        const apiSpaceIds = apiSpaces.map(s => s.name);
        const missingSpaces = apiSpaces.filter(s => !dbSpaceIds.has(s.name));
        const extraSpaces = dbChats.filter(c => !apiSpaceIds.includes(c.spaceId));
        
        console.log(`\\n🔍 Differences:`);
        console.log(`  Missing from DB: ${missingSpaces.length} spaces`);
        console.log(`  Extra in DB: ${extraSpaces.length} spaces`);
        
        if (missingSpaces.length > 0) {
            console.log('\\n  Missing spaces:');
            missingSpaces.forEach((space, i) => {
                console.log(`    ${i+1}. ${space.name} - ${space.displayName || '(No name)'} (${space.spaceType})`);
            });
        }
        
        if (extraSpaces.length > 0) {
            console.log('\\n  Extra spaces in DB:');
            extraSpaces.forEach((chat, i) => {
                console.log(`    ${i+1}. ${chat.spaceId} - ${chat.displayName} (${chat.spaceType})`);
            });
        }
        
        console.log('\\n🔄 STEP 3: Sync missing spaces');
        let newChatsCount = 0;
        let newMessagesCount = 0;
        
        for (const space of missingSpaces) {
            try {
                const spaceId = space.name;
                const spaceType = space.spaceType;
                const displayName = space.displayName || 
                    (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");
                
                console.log(`\\n  📥 Syncing: ${displayName} (${spaceType})`);
                
                // Get messages for this space
                const messageRes = await chat.spaces.messages.list({
                    parent: spaceId,
                    pageSize: 100
                });
                
                const rawMessages = messageRes.data.messages || [];
                const messages = [];
                
                console.log(`     Found ${rawMessages.length} messages`);
                
                // Process messages with improved user resolution
                for (const m of rawMessages) {
                    const senderId = m.sender?.name || "Unknown";
                    
                    // Try to resolve user info
                    let senderInfo = { 
                        email: 'unknown@unknown', 
                        displayName: senderId.split('/').pop()?.substring(0, 8) || 'Unknown',
                        domain: 'unknown'
                    };
                    
                    // Try to find existing mapping first
                    try {
                        const existingInfo = await UserMapping.getUserInfo(senderId);
                        if (existingInfo) {
                            senderInfo = existingInfo;
                        } else {
                            // Create fallback mapping for tracking
                            const shortId = senderId.split('/').pop()?.substring(0, 8) || 'unknown';
                            const fallbackEmail = `${senderId.replace('users/', 'user-')}@crossmilescarrier.com`;
                            
                            await UserMapping.findOrCreateUser({
                                userId: senderId,
                                displayName: `User ${shortId}`,
                                email: fallbackEmail,
                                domain: 'crossmilescarrier.com',
                                resolvedBy: 'sync_fallback',
                                discoveredByAccount: account._id,
                                confidence: 20,
                                originalUserResourceName: senderId
                            });
                            
                            senderInfo = {
                                email: fallbackEmail,
                                displayName: `User ${shortId}`,
                                domain: 'crossmilescarrier.com'
                            };
                        }
                    } catch (resolveError) {
                        console.log(`       Warning: Failed to resolve ${senderId}: ${resolveError.message}`);
                    }
                    
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
                
            } catch (spaceError) {
                console.log(`     ❌ Failed to sync ${space.name}: ${spaceError.message}`);
            }
        }
        
        console.log(`\\n✅ STEP 4: Sync completed`);
        console.log(`  New chats synced: ${newChatsCount}`);
        console.log(`  New messages synced: ${newMessagesCount}`);
        
        console.log('\\n👥 STEP 5: Update user mappings with better names');
        
        // Check if we should add other participant emails as "potential accounts"
        // This would make DM filtering less strict
        console.log('\\n📧 STEP 6: Check DM participants for potential account creation');
        
        const allChats = await Chat.find({ account: account._id, spaceType: 'DIRECT_MESSAGE' });
        const participantEmails = new Set();
        
        for (const chat of allChats) {
            for (const message of chat.messages || []) {
                if (message.senderEmail && 
                    message.senderEmail !== account.email && 
                    message.senderEmail.endsWith('@crossmilescarrier.com') &&
                    !message.senderEmail.startsWith('user-')) {
                    participantEmails.add(message.senderEmail);
                }
            }
        }
        
        console.log(`\\nFound ${participantEmails.size} potential DM participants:`);
        Array.from(participantEmails).forEach(email => {
            console.log(`  - ${email}`);
        });
        
        if (participantEmails.size > 0) {
            console.log('\\n💡 RECOMMENDATION:');
            console.log('To see DM chats, you have two options:');
            console.log('1. Add these users as synced accounts in your system');
            console.log('2. Modify the DM filtering logic to be less strict');
        }
        
        // Update account last sync time
        account.lastChatSync = new Date();
        await account.save();
        
        console.log('\\n🎉 COMPREHENSIVE SYNC FIX COMPLETED!');
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
    }
    
    mongoose.disconnect();
}

// Run the fix
fixChatSync().catch(console.error);
