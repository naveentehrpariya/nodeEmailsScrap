const mongoose = require('mongoose');
const { google } = require('googleapis');
const Chat = require('../db/Chat');
const Account = require('../db/Account');
const UserMapping = require('../db/UserMapping');
const keys = require('../dispatch.json');

// Rate limiting
const pLimit = require('p-limit');
const limit = pLimit(5); // Max 5 concurrent requests to respect Google API quotas

const DOMAIN = "crossmilescarrier.com";

const SCOPES = [
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.messages.readonly", 
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
];

async function resolveUnmappedUsers(options = {}) {
    const { specificUserIds = null, force = false, dryRun = false } = options;
    
    console.log('🔍 Starting unmapped user resolution process...');
    console.log(`Options: force=${force}, dryRun=${dryRun}`);
    
    let resolvedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let updatedMessagesCount = 0;
    
    try {
        await mongoose.connect(process.env.DB_URL || 'mongodb://127.0.0.1:27017/scrapapiapp', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ Connected to MongoDB');
        
        // Use any account for database reference, but use dispatch email for API
        const dbAccount = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!dbAccount) {
            throw new Error('No account found in database');
        }
        
        // Use dispatch email for API (we know it works from our test)
        const apiEmail = 'dispatch@crossmilescarrier.com';
        
        console.log(`🔑 Using ${apiEmail} for API authentication, ${dbAccount.email} for DB reference`);
        
        // Setup Google API auth
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            apiEmail // Impersonate dispatch account (has API access)
        );
        
        const admin = google.admin({ version: 'directory_v1', auth });
        
        // Step 1: Find all unresolved user IDs from chat messages
        console.log('\n📋 Step 1: Scanning chat messages for unresolved user IDs...');
        
        let unmappedUserIds = new Set();
        
        if (specificUserIds) {
            // Use provided user IDs
            specificUserIds.forEach(id => unmappedUserIds.add(id));
            console.log(`Using ${specificUserIds.length} specific user IDs`);
        } else {
            // Scan all chats for unmapped users
            const allChats = await Chat.find({}).lean();
            console.log(`Found ${allChats.length} total chats to scan`);
            
            for (const chat of allChats) {
                for (const message of chat.messages || []) {
                    const senderId = message.senderId;
                    const senderDisplayName = message.senderDisplayName;
                    
                    // Check if sender looks like an unresolved Google user ID
                    if (senderId && (
                        senderId.match(/^users\/\d+$/) || 
                        senderId.match(/^\d{10,}$/) ||
                        senderDisplayName === senderId ||
                        senderDisplayName?.match(/^users\/\d+$/)
                    )) {
                        // Check if we already have a good mapping for this user
                        const existingMapping = await UserMapping.getUserInfo(senderId);
                        if (!existingMapping || 
                            existingMapping.confidence < 80 || 
                            existingMapping.email?.includes('@unknown') ||
                            force) {
                            unmappedUserIds.add(senderId);
                        }
                    }
                }
            }
        }
        
        console.log(`\n📊 Found ${unmappedUserIds.size} user IDs to resolve`);
        
        if (unmappedUserIds.size === 0) {
            console.log('✅ No unmapped users found. All users are already resolved!');
            return {
                resolvedCount: 0,
                failedCount: 0,
                skippedCount: 0,
                updatedMessagesCount: 0
            };
        }
        
        // Step 2: Resolve each user ID using Google Directory API
        console.log('\n🔄 Step 2: Resolving user IDs via Google Directory API...');
        
        const userIdsArray = Array.from(unmappedUserIds);
        const resolutionPromises = userIdsArray.map((userId, index) => 
            limit(() => resolveUserWithAllMethods(admin, userId, dbAccount._id, index, userIdsArray.length))
        );
        
        const resolutionResults = await Promise.allSettled(resolutionPromises);
        
        // Process results
        for (let i = 0; i < resolutionResults.length; i++) {
            const result = resolutionResults[i];
            const userId = userIdsArray[i];
            
            if (result.status === 'fulfilled' && result.value) {
                if (result.value.resolved) {
                    resolvedCount++;
                    console.log(`  ✅ ${userId} → ${result.value.displayName} (${result.value.email})`);
                } else {
                    skippedCount++;
                    console.log(`  ⏭️ ${userId} → skipped (already resolved)`);
                }
            } else {
                failedCount++;
                const error = result.reason || 'Unknown error';
                console.log(`  ❌ ${userId} → failed (${error})`);
            }
        }
        
        if (dryRun) {
            console.log('\n🔍 DRY RUN: Skipping message updates');
        } else {
            // Step 3: Update chat messages with resolved user information
            console.log('\n📝 Step 3: Updating chat messages with resolved information...');
            
            for (const userId of unmappedUserIds) {
                const resolvedInfo = await UserMapping.getUserInfo(userId);
                if (resolvedInfo && resolvedInfo.confidence >= 80) {
                    // Update all chat messages with this senderId
                    const updateResult = await Chat.updateMany(
                        { "messages.senderId": userId },
                        {
                            $set: {
                                "messages.$.senderDisplayName": resolvedInfo.displayName,
                                "messages.$.senderEmail": resolvedInfo.email,
                                "messages.$.senderDomain": resolvedInfo.domain
                            }
                        }
                    );
                    
                    if (updateResult.modifiedCount > 0) {
                        updatedMessagesCount += updateResult.modifiedCount;
                        console.log(`  📤 Updated ${updateResult.modifiedCount} messages for ${userId} → ${resolvedInfo.displayName}`);
                    }
                }
            }
        }
        
        // Step 4: Summary report
        console.log('\n📊 RESOLUTION SUMMARY:');
        console.log(`  ✅ Successfully resolved: ${resolvedCount} users`);
        console.log(`  ⏭️ Skipped (already good): ${skippedCount} users`);
        console.log(`  ❌ Failed to resolve: ${failedCount} users`);
        if (!dryRun) {
            console.log(`  📝 Updated chat messages: ${updatedMessagesCount} messages`);
        }
        console.log(`  📈 Success rate: ${((resolvedCount / (resolvedCount + failedCount)) * 100).toFixed(1)}%`);
        
        return {
            resolvedCount,
            failedCount,
            skippedCount,
            updatedMessagesCount
        };
        
    } catch (error) {
        console.error('❌ Error in resolveUnmappedUsers:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

async function resolveUserWithAllMethods(admin, senderId, discoveredByAccountId, index, total) {
    try {
        console.log(`[${index + 1}/${total}] 🔍 Resolving: ${senderId}`);
        
        // Check if already well-resolved
        const existingMapping = await UserMapping.getUserInfo(senderId);
        if (existingMapping && existingMapping.confidence >= 95) {
            return { resolved: false, reason: 'Already well-resolved' };
        }
        
        // Extract numeric ID for alternate lookups
        const numericId = senderId.includes('/') ? senderId.split('/').pop() : senderId;
        
        // Method 1: Try Google Admin Directory API (most accurate)
        let resolvedInfo = await tryAdminDirectoryAPI(admin, senderId, numericId);
        
        if (resolvedInfo) {
            // Create high-confidence mapping
            await UserMapping.findOrCreateUser({
                userId: senderId,
                displayName: resolvedInfo.displayName,
                email: resolvedInfo.email,
                domain: resolvedInfo.domain,
                resolvedBy: 'admin_directory_api',
                discoveredByAccount: discoveredByAccountId,
                confidence: 95,
                originalUserResourceName: senderId
            });
            
            return {
                resolved: true,
                ...resolvedInfo
            };
        }
        
        // Method 2: Create smart fallback if no resolution possible
        if (/^\d{18,}$/.test(numericId)) {
            // Looks like a real Google user ID but API failed
            const shortId = numericId.substring(0, 8);
            const fallbackInfo = {
                email: `user-${shortId}@${DOMAIN}`,
                displayName: `User ${shortId}`,
                domain: DOMAIN
            };
            
            // Only create fallback if confidence would be better than existing
            if (!existingMapping || existingMapping.confidence < 30) {
                await UserMapping.findOrCreateUser({
                    userId: senderId,
                    displayName: fallbackInfo.displayName,
                    email: fallbackInfo.email,
                    domain: fallbackInfo.domain,
                    resolvedBy: 'smart_fallback',
                    discoveredByAccount: discoveredByAccountId,
                    confidence: 30,
                    originalUserResourceName: senderId
                });
                
                return {
                    resolved: true,
                    ...fallbackInfo
                };
            }
        }
        
        throw new Error('No resolution method succeeded');
        
    } catch (error) {
        console.log(`      ⚠️ Resolution failed: ${error.message}`);
        throw error;
    }
}

async function tryAdminDirectoryAPI(admin, originalUserId, numericId) {
    const candidateIds = [
        originalUserId,
        numericId,
        `users/${numericId}`,
        originalUserId.replace('users/', '')
    ];
    
    // Remove duplicates and invalid candidates
    const uniqueCandidates = [...new Set(candidateIds.filter(id => id && id.length > 0))];
    
    for (const candidateId of uniqueCandidates) {
        try {
            const userRes = await admin.users.get({ userKey: candidateId });
            if (userRes?.data) {
                const userData = userRes.data;
                const email = userData.primaryEmail;
                const displayName = userData.name?.fullName || 
                                   userData.name?.givenName || 
                                   email?.split('@')[0] ||
                                   `User ${numericId.substring(0, 8)}`;
                
                return {
                    email: email,
                    displayName: displayName,
                    domain: email?.split('@')[1] || DOMAIN
                };
            }
        } catch (apiError) {
            // Continue to next candidate
            continue;
        }
    }
    
    return null; // No candidate worked
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--force':
                options.force = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--user-ids':
                if (i + 1 < args.length) {
                    options.specificUserIds = args[i + 1].split(',').map(id => id.trim());
                    i++; // Skip next argument
                }
                break;
        }
    }
    
    console.log('🚀 Starting user resolution utility...');
    console.log('Usage: node scripts/resolveUnmappedUsers.js [--force] [--dry-run] [--user-ids=id1,id2,id3]');
    console.log('');
    
    resolveUnmappedUsers(options)
        .then((result) => {
            console.log('\n🎉 User resolution completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 User resolution failed:', error);
            process.exit(1);
        });
}

module.exports = { resolveUnmappedUsers };
