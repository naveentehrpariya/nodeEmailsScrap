const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const { google } = require('googleapis');
const keys = require('./dispatch.json');

const MONGODB_URI = 'mongodb://localhost:27017/emailscrap';

async function diagnoseMissingChats() {
    console.log('🔍 DIAGNOSING MISSING CHATS');
    console.log('============================');
    
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to database');
        
        // Get naveendev account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }
        
        console.log(`👤 Account: ${account.email}`);
        
        // Check current database state
        console.log('\n📊 CURRENT DATABASE STATE');
        console.log('-------------------------');
        const dbChats = await Chat.find({ account: account._id })
            .select('spaceId displayName spaceType messageCount lastMessageTime')
            .sort({ lastMessageTime: -1 })
            .lean();
        
        console.log(`Database chats: ${dbChats.length}`);
        dbChats.forEach((chat, i) => {
            console.log(`  ${i+1}. ${chat.spaceId} - "${chat.displayName}" (${chat.spaceType}) - ${chat.messageCount} msgs`);
        });
        
        // Fetch chats from Google Chat API
        console.log('\n🌐 GOOGLE CHAT API STATE');
        console.log('-------------------------');
        
        // Setup Google Chat API
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/admin.directory.user.readonly"
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            account.email
        );

        const chat = google.chat({ version: 'v1', auth });
        
        try {
            console.log('📡 Fetching spaces from Google Chat API...');
            const spacesResponse = await chat.spaces.list({
                pageSize: 100
            });
            
            const googleSpaces = spacesResponse.data.spaces || [];
            console.log(`Google API spaces: ${googleSpaces.length}`);
            
            // Display all Google spaces
            googleSpaces.forEach((space, i) => {
                const displayName = space.displayName || space.name || '(Unnamed)';
                console.log(`  ${i+1}. ${space.name} - "${displayName}" (${space.spaceType})`);
            });
            
            // Compare what's missing
            console.log('\n🔍 COMPARISON ANALYSIS');
            console.log('----------------------');
            
            const dbSpaceIds = new Set(dbChats.map(chat => chat.spaceId));
            const googleSpaceIds = new Set(googleSpaces.map(space => space.name));
            
            console.log(`Database has ${dbSpaceIds.size} unique space IDs`);
            console.log(`Google API has ${googleSpaceIds.size} unique space IDs`);
            
            // Find spaces that are in Google but not in database
            const missingFromDB = [];
            googleSpaces.forEach(space => {
                if (!dbSpaceIds.has(space.name)) {
                    missingFromDB.push(space);
                }
            });
            
            console.log(`\n❌ MISSING FROM DATABASE (${missingFromDB.length} chats):`);
            missingFromDB.forEach((space, i) => {
                const displayName = space.displayName || space.name || '(Unnamed)';
                console.log(`  ${i+1}. ${space.name} - "${displayName}" (${space.spaceType})`);
            });
            
            // Find spaces that are in database but not in Google (shouldn't happen)
            const extraInDB = [];
            dbChats.forEach(chat => {
                if (!googleSpaceIds.has(chat.spaceId)) {
                    extraInDB.push(chat);
                }
            });
            
            if (extraInDB.length > 0) {
                console.log(`\n⚠️ EXTRA IN DATABASE (${extraInDB.length} chats):`);
                extraInDB.forEach((chat, i) => {
                    console.log(`  ${i+1}. ${chat.spaceId} - "${chat.displayName}" (${chat.spaceType})`);
                });
            }
            
            // Check message counts for spaces that exist in both
            console.log('\n📨 MESSAGE COUNT ANALYSIS');
            console.log('-------------------------');
            
            for (const space of googleSpaces) {
                const dbChat = dbChats.find(chat => chat.spaceId === space.name);
                if (dbChat) {
                    try {
                        // Get message count from Google API
                        console.log(`📡 Checking messages for ${space.name}...`);
                        const messagesResponse = await chat.spaces.messages.list({
                            parent: space.name,
                            pageSize: 1000
                        });
                        
                        const googleMessageCount = messagesResponse.data.messages?.length || 0;
                        const dbMessageCount = dbChat.messageCount || 0;
                        
                        if (googleMessageCount !== dbMessageCount) {
                            console.log(`⚠️ Message count mismatch for ${space.name}:`);
                            console.log(`   Google API: ${googleMessageCount} messages`);
                            console.log(`   Database: ${dbMessageCount} messages`);
                        }
                    } catch (msgError) {
                        console.log(`❌ Failed to fetch messages for ${space.name}: ${msgError.message}`);
                    }
                }
            }
            
            // Provide recommendations
            console.log('\n💡 RECOMMENDATIONS');
            console.log('------------------');
            
            if (missingFromDB.length > 0) {
                console.log('✅ ACTION NEEDED: Re-run sync to add missing chats to database');
                console.log('   The following chats are available in Google but missing from database:');
                missingFromDB.forEach((space, i) => {
                    const displayName = space.displayName || space.name || '(Unnamed)';
                    console.log(`   - ${displayName} (${space.spaceType})`);
                });
            } else {
                console.log('✅ All Google spaces are present in database');
            }
            
        } catch (apiError) {
            console.error('❌ Google Chat API Error:', apiError.message);
            if (apiError.response?.data) {
                console.error('Response data:', JSON.stringify(apiError.response.data, null, 2));
            }
        }
        
        console.log('\n✅ Diagnosis completed');
        
    } catch (error) {
        console.error('❌ Error during diagnosis:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run the diagnosis
diagnoseMissingChats();
