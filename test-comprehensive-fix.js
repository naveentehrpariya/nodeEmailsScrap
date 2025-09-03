require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./db/Chat');
const Account = require('./db/Account');
const UserMapping = require('./db/UserMapping');

class ChatSyncTester {
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

    async runDiagnostics() {
        try {
            console.log('🔍 CHAT SYNC DIAGNOSTICS - BEFORE FIX');
            console.log('=' .repeat(60));
            
            await this.connectDB();
            
            // Find accounts
            const accounts = await Account.find({}).lean();
            console.log(`📧 Total accounts: ${accounts.length}`);
            
            for(const account of accounts) {
                console.log(`\n📄 Account: ${account.email}`);
                
                const chats = await Chat.find({account: account._id}).lean();
                console.log(`  💬 Total chats: ${chats.length}`);
                
                const directMessages = chats.filter(c => c.spaceType === 'DIRECT_MESSAGE');
                const groupChats = chats.filter(c => c.spaceType !== 'DIRECT_MESSAGE');
                
                console.log(`  📱 Direct messages: ${directMessages.length}`);
                console.log(`  👥 Group chats: ${groupChats.length}`);
                
                // Check participant issues
                const chatsWithoutParticipants = chats.filter(c => !c.participants || c.participants.length === 0);
                const chatsWithUserIdNames = chats.filter(c => 
                    c.participants && c.participants.some(p => 
                        p.displayName && (p.displayName.startsWith('User ') || p.displayName.includes('users/'))
                    )
                );
                
                console.log(`  ❌ Chats without participants: ${chatsWithoutParticipants.length}`);
                console.log(`  🆔 Chats with user ID names: ${chatsWithUserIdNames.length}`);
                
                // Show examples of problematic chats
                if(chatsWithUserIdNames.length > 0) {
                    console.log('\n  🔍 Example problematic chats:');
                    chatsWithUserIdNames.slice(0, 3).forEach((chat, i) => {
                        console.log(`    ${i+1}. "${chat.displayName}" (${chat.spaceId})`);
                        console.log(`       Participants: ${chat.participants.map(p => p.displayName || p.email).join(', ')}`);
                        console.log(`       Messages: ${chat.messages.length}`);
                    });
                }

                // Check for messages with unresolved senders
                let messagesWithUserIds = 0;
                chats.forEach(chat => {
                    chat.messages.forEach(msg => {
                        if (msg.senderDisplayName && 
                            (msg.senderDisplayName.startsWith('User ') || msg.senderDisplayName.includes('users/'))) {
                            messagesWithUserIds++;
                        }
                    });
                });

                console.log(`  📨 Messages with unresolved sender names: ${messagesWithUserIds}`);
            }
            
            // Check user mappings
            const userMappings = await UserMapping.find({}).lean();
            console.log(`\n👤 Total User Mappings: ${userMappings.length}`);
            
            const mappingsByMethod = {};
            const confidenceLevels = { high: 0, medium: 0, low: 0 };
            
            userMappings.forEach(m => {
                mappingsByMethod[m.resolvedBy] = (mappingsByMethod[m.resolvedBy] || 0) + 1;
                
                if (m.confidence >= 80) confidenceLevels.high++;
                else if (m.confidence >= 50) confidenceLevels.medium++;
                else confidenceLevels.low++;
            });
            
            console.log('\n📊 User mapping methods:');
            Object.entries(mappingsByMethod).forEach(([method, count]) => {
                console.log(`  ${method}: ${count}`);
            });

            console.log('\n📈 Confidence levels:');
            console.log(`  High (80-100): ${confidenceLevels.high}`);
            console.log(`  Medium (50-79): ${confidenceLevels.medium}`);
            console.log(`  Low (0-49): ${confidenceLevels.low}`);
            
            // Check for the most common issues
            const fallbackMappings = userMappings.filter(m => 
                m.resolvedBy.includes('fallback') || 
                m.displayName.startsWith('User ')
            );
            
            console.log(`\n⚠️  Fallback mappings: ${fallbackMappings.length}`);
            
            await this.disconnectDB();
            console.log('\n✅ Diagnostics complete');
            
            return {
                totalChats: await this.getTotalChatCount(),
                problematicChats: await this.getProblematicChatCount(),
                fallbackMappings: fallbackMappings.length,
                totalMappings: userMappings.length
            };
            
        } catch(error) {
            console.error('❌ Error during diagnostics:', error.message);
            await this.disconnectDB();
            throw error;
        }
    }

    async getTotalChatCount() {
        const count = await Chat.countDocuments({});
        return count;
    }

    async getProblematicChatCount() {
        const problematicChats = await Chat.find({
            $or: [
                { participants: { $exists: false } },
                { participants: { $size: 0 } },
                { 'participants.displayName': { $regex: /^User \d+/ } }
            ]
        }).countDocuments();
        
        return problematicChats;
    }

    async runComprehensiveFix() {
        try {
            console.log('\n🚀 RUNNING COMPREHENSIVE CHAT SYNC FIX');
            console.log('=' .repeat(60));
            
            // Run the comprehensive fix
            const { spawn } = require('child_process');
            
            return new Promise((resolve, reject) => {
                const fixProcess = spawn('node', ['fix-chat-sync-comprehensive.js'], {
                    cwd: __dirname,
                    stdio: 'pipe'
                });
                
                fixProcess.stdout.on('data', (data) => {
                    console.log(data.toString());
                });
                
                fixProcess.stderr.on('data', (data) => {
                    console.error(data.toString());
                });
                
                fixProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('\n✅ Comprehensive fix completed successfully');
                        resolve();
                    } else {
                        console.error(`\n❌ Comprehensive fix failed with exit code ${code}`);
                        reject(new Error(`Fix process exited with code ${code}`));
                    }
                });
                
                // Timeout after 10 minutes
                setTimeout(() => {
                    fixProcess.kill('SIGTERM');
                    reject(new Error('Fix process timed out after 10 minutes'));
                }, 10 * 60 * 1000);
            });
            
        } catch(error) {
            console.error('❌ Error running comprehensive fix:', error.message);
            throw error;
        }
    }

    async verifyFixes() {
        try {
            console.log('\n🔍 VERIFYING FIXES - AFTER COMPREHENSIVE SYNC');
            console.log('=' .repeat(60));
            
            await this.connectDB();
            
            const afterStats = {
                totalChats: 0,
                chatsWithGoodParticipants: 0,
                chatsWithUserIds: 0,
                messagesFixed: 0,
                newUserMappings: 0
            };
            
            const accounts = await Account.find({}).lean();
            
            for(const account of accounts) {
                console.log(`\n📄 Account: ${account.email}`);
                
                const chats = await Chat.find({account: account._id}).lean();
                afterStats.totalChats += chats.length;
                
                let goodParticipants = 0;
                let userIdParticipants = 0;
                let fixedMessages = 0;
                
                chats.forEach(chat => {
                    // Check participants
                    if (chat.participants && chat.participants.length > 0) {
                        const hasGoodNames = chat.participants.some(p => 
                            p.displayName && 
                            !p.displayName.startsWith('User ') && 
                            !p.displayName.includes('users/') &&
                            p.email && 
                            p.email.includes('@')
                        );
                        
                        if (hasGoodNames) {
                            goodParticipants++;
                        } else {
                            userIdParticipants++;
                        }
                    }
                    
                    // Check messages
                    chat.messages.forEach(msg => {
                        if (msg.senderDisplayName && 
                            !msg.senderDisplayName.startsWith('User ') &&
                            msg.senderEmail && 
                            msg.senderEmail.includes('@')) {
                            fixedMessages++;
                        }
                    });
                });
                
                afterStats.chatsWithGoodParticipants += goodParticipants;
                afterStats.chatsWithUserIds += userIdParticipants;
                afterStats.messagesFixed += fixedMessages;
                
                console.log(`  💬 Total chats: ${chats.length}`);
                console.log(`  ✅ Chats with resolved participants: ${goodParticipants}`);
                console.log(`  🆔 Chats still with user IDs: ${userIdParticipants}`);
                console.log(`  📨 Messages with resolved senders: ${fixedMessages}`);
            }
            
            // Check new user mappings
            const userMappings = await UserMapping.find({}).lean();
            const highConfidenceMappings = userMappings.filter(m => m.confidence >= 80);
            
            console.log(`\n👤 Total User Mappings: ${userMappings.length}`);
            console.log(`📈 High confidence mappings: ${highConfidenceMappings.length}`);
            
            afterStats.newUserMappings = userMappings.length;
            
            await this.disconnectDB();
            
            return afterStats;
            
        } catch(error) {
            console.error('❌ Error verifying fixes:', error.message);
            await this.disconnectDB();
            throw error;
        }
    }

    async runFullTest() {
        try {
            console.log('🧪 COMPREHENSIVE CHAT SYNC TEST');
            console.log('=' .repeat(70));
            
            // Step 1: Run diagnostics
            const beforeStats = await this.runDiagnostics();
            
            // Step 2: Run comprehensive fix
            await this.runComprehensiveFix();
            
            // Step 3: Verify fixes
            const afterStats = await this.verifyFixes();
            
            // Step 4: Show results
            console.log('\n📊 FINAL RESULTS');
            console.log('=' .repeat(40));
            console.log(`Total chats processed: ${afterStats.totalChats}`);
            console.log(`Chats with resolved participants: ${afterStats.chatsWithGoodParticipants}`);
            console.log(`Messages with resolved senders: ${afterStats.messagesFixed}`);
            console.log(`Total user mappings: ${afterStats.newUserMappings}`);
            
            const improvementRate = afterStats.chatsWithGoodParticipants / afterStats.totalChats * 100;
            console.log(`\n🎯 Improvement rate: ${improvementRate.toFixed(1)}%`);
            
            if (improvementRate > 80) {
                console.log('🎉 EXCELLENT! Chat sync issues have been resolved');
            } else if (improvementRate > 60) {
                console.log('✅ GOOD! Significant improvements made');
            } else {
                console.log('⚠️  PARTIAL: Some issues remain, may need additional fixes');
            }
            
        } catch(error) {
            console.error('❌ Test failed:', error.message);
            process.exit(1);
        }
    }
}

// Run the full test if this script is executed directly
if (require.main === module) {
    const tester = new ChatSyncTester();
    tester.runFullTest();
}

module.exports = ChatSyncTester;
