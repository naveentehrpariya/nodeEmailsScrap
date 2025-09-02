const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

mongoose.connect('mongodb://127.0.0.1:27017/scrapapiapp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

async function debugChats() {
    try {
        console.log('🔍 DEBUG: Starting chat debugging...');
        
        // Find account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            console.log('❌ Account not found');
            process.exit(1);
        }
        console.log('✅ Account found:', account._id);
        
        // Get all chats for this account
        const allChats = await Chat.find({ account: account._id }).lean();
        console.log(`📊 Total chats in DB: ${allChats.length}`);
        
        // Show chat types and basic info
        for (const chat of allChats) {
            console.log(`\n📝 Chat: ${chat.spaceId}`);
            console.log(`   Type: ${chat.spaceType}`);
            console.log(`   Display Name: ${chat.displayName}`);
            console.log(`   Messages: ${chat.messageCount}`);
            console.log(`   Participants: ${chat.participants?.length || 0}`);
            
            if (chat.spaceType === 'DIRECT_MESSAGE') {
                console.log('   🔍 DM Analysis:');
                
                // Count senders by senderId  
                const senderCounts = {};
                for (const m of chat.messages || []) {
                    if (m.senderId) {
                        senderCounts[m.senderId] = (senderCounts[m.senderId] || 0) + 1;
                    }
                }
                const candidates = Object.keys(senderCounts).sort((a, b) => senderCounts[b] - senderCounts[a]);
                console.log(`   Sender candidates: ${candidates.slice(0, 3).join(', ')}`);
                
                // Try to find other participant
                let otherEmailForFilter = null;
                for (const cand of candidates) {
                    try {
                        let info = await UserMapping.getUserInfo(cand);
                        if (!info && cand.includes('/')) {
                            info = await UserMapping.getUserInfo(cand.split('/').pop());
                        }
                        if (info && info.email && info.email !== account.email) {
                            otherEmailForFilter = info.email;
                            console.log(`   Other participant: ${info.displayName} (${info.email})`);
                            break;
                        }
                    } catch (e) {
                        console.log(`   Error resolving ${cand}: ${e.message}`);
                    }
                }
                
                if (!otherEmailForFilter && chat.messages.length > 0) {
                    const otherMsg = chat.messages.find(m => m.senderEmail && m.senderEmail !== account.email);
                    if (otherMsg) {
                        otherEmailForFilter = otherMsg.senderEmail;
                        console.log(`   Other participant from message: ${otherEmailForFilter}`);
                    }
                }
                
                console.log(`   Filter decision: ${otherEmailForFilter ? 'SHOW' : 'HIDE'}`);
                
                // Apply filtering logic
                if (!otherEmailForFilter || otherEmailForFilter === account.email) {
                    console.log('   ❌ Filtered: No other participant or talking to self');
                } else if (otherEmailForFilter === 'unknown@unknown' || 
                          otherEmailForFilter.endsWith('@unknown') ||
                          otherEmailForFilter === 'Unknown') {
                    console.log('   ❌ Filtered: Unknown/system user');  
                } else {
                    console.log('   ✅ Passed: Real user DM');
                }
            }
        }
        
        console.log('\n📋 User Mappings Summary:');
        const mappings = await UserMapping.find({}).limit(10).lean();
        for (const mapping of mappings) {
            console.log(`   ${mapping.userId} -> ${mapping.displayName} (${mapping.email}) [${mapping.resolvedBy}]`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

debugChats();
