const cron = require('node-cron');
const ChatSyncService = require('./optimizedChatSyncService'); // Use optimized service for faster, error-free syncs
const Account = require('../db/Account');
const UserMapping = require('../db/UserMapping');
const Chat = require('../db/Chat');

class ChatSyncScheduler {
    constructor() {
        this.isRunning = false;
        this.currentJob = null;
        this.stats = {
            lastRun: null,
            nextRun: null,
            totalAccountsSynced: 0,
            totalChatsSynced: 0,
            totalMessagesSynced: 0,
            totalUserMappings: 0,
            errors: []
        };
    }

    // Start the automated chat sync scheduler
    start(cronExpression = '0 */6 * * *') { // Default: Every 6 hours
        if (this.currentJob) {
            console.log('⚠️ Chat sync scheduler is already running');
            return false;
        }

        console.log(`🚀 Starting chat sync scheduler with cron: ${cronExpression}`);
        
        this.currentJob = cron.schedule(cronExpression, async () => {
            await this.runFullSync();
        }, {
            scheduled: false, // Don't start immediately
            timezone: "America/New_York" // Adjust timezone as needed
        });

        this.currentJob.start();
        this.isRunning = true;
        
        // Update next run time
        this.updateNextRunTime(cronExpression);
        
        console.log(`✅ Chat sync scheduler started. Next run: ${this.stats.nextRun}`);
        return true;
    }

    // Stop the scheduler
    stop() {
        if (this.currentJob) {
            this.currentJob.destroy();
            this.currentJob = null;
            this.isRunning = false;
            console.log('🛑 Chat sync scheduler stopped');
            return true;
        }
        return false;
    }

    // Run full sync for all accounts
    async runFullSync() {
        if (this.isRunning && this.stats.lastRun && (Date.now() - new Date(this.stats.lastRun).getTime()) < 60000) {
            console.log('⚠️ Sync already running, skipping...');
            return;
        }

        console.log('🔄 Starting full chat sync for all accounts + cleanup...');
        const startTime = Date.now();
        
        try {
            this.stats.lastRun = new Date();
            this.stats.errors = [];

            // First, clean up old chat messages (older than 2 months)
            console.log('🧹 Starting chat cleanup (removing messages older than 2 months)...');
            const cleanupResults = await this.cleanupOldChatMessages();

            // Get user mapping stats before sync
            const userMappingsBefore = await UserMapping.countDocuments();
            
            // Run the optimized sync service
            const results = await ChatSyncService.syncAllChats();
            
            // Update statistics
            let totalChats = 0;
            let totalMessages = 0;
            let successCount = 0;
            
            results.forEach(result => {
                if (result.success) {
                    totalChats += result.syncedChats;
                    totalMessages += result.syncedMessages;
                    successCount++;
                } else {
                    this.stats.errors.push({
                        account: result.email,
                        error: result.error,
                        timestamp: new Date()
                    });
                }
            });

            // Get user mapping stats after sync
            const userMappingsAfter = await UserMapping.countDocuments();
            
            this.stats.totalAccountsSynced = successCount;
            this.stats.totalChatsSynced += totalChats;
            this.stats.totalMessagesSynced += totalMessages;
            this.stats.totalUserMappings = userMappingsAfter;

            const duration = Math.round((Date.now() - startTime) / 1000);
            
            console.log(`✅ Full sync completed in ${duration}s:`);
            console.log(`   📧 Accounts synced: ${successCount}/${results.length}`);
            console.log(`   💬 New chats: ${totalChats}`);
            console.log(`   📝 New messages: ${totalMessages}`);
            console.log(`   👥 User mappings: ${userMappingsBefore} → ${userMappingsAfter} (+${userMappingsAfter - userMappingsBefore})`);
            console.log(`   🗑️ Cleanup: ${cleanupResults.affectedChats} chats processed, messages older than 2 months removed`);
            
            if (this.stats.errors.length > 0) {
                console.log(`   ❌ Errors: ${this.stats.errors.length}`);
                this.stats.errors.forEach(err => {
                    console.log(`      ${err.account}: ${err.error}`);
                });
            }

        } catch (error) {
            console.error('❌ Full sync failed:', error.message);
            this.stats.errors.push({
                account: 'SYSTEM',
                error: error.message,
                timestamp: new Date()
            });
        }
    }

    // Run sync manually for specific account
    async syncSpecificAccount(accountEmail) {
        try {
            console.log(`🔄 Manual sync for account: ${accountEmail}`);
            
            const account = await Account.findOne({ email: accountEmail });
            if (!account) {
                throw new Error('Account not found');
            }

            const result = await ChatSyncService.syncAccountChats(account);
            
            console.log(`✅ Manual sync completed for ${accountEmail}:`);
            console.log(`   💬 Chats: ${result.syncedChats}`);
            console.log(`   📝 Messages: ${result.syncedMessages}`);
            console.log(`   ⏱️ Duration: ${result.duration}s`);
            
            return result;

        } catch (error) {
            console.error(`❌ Manual sync failed for ${accountEmail}:`, error.message);
            throw error;
        }
    }

    // Get scheduler status and statistics
    getStatus() {
        return {
            isRunning: this.isRunning,
            stats: this.stats,
            hasJob: !!this.currentJob
        };
    }

    // Update next run time (helper function)
    updateNextRunTime(cronExpression) {
        try {
            // Simple next run calculation (this is a basic implementation)
            const now = new Date();
            if (cronExpression === '0 */6 * * *') {
                // Every 6 hours
                const next = new Date(now);
                next.setHours(Math.ceil(now.getHours() / 6) * 6, 0, 0, 0);
                if (next <= now) {
                    next.setHours(next.getHours() + 6);
                }
                this.stats.nextRun = next;
            } else if (cronExpression === '0 0 * * *') {
                // Daily at midnight
                const next = new Date(now);
                next.setDate(now.getDate() + 1);
                next.setHours(0, 0, 0, 0);
                this.stats.nextRun = next;
            } else {
                // Default to 6 hours from now
                const next = new Date(now.getTime() + 6 * 60 * 60 * 1000);
                this.stats.nextRun = next;
            }
        } catch (error) {
            console.error('Error calculating next run time:', error.message);
            this.stats.nextRun = new Date(Date.now() + 6 * 60 * 60 * 1000);
        }
    }

    // Get user mapping statistics
    async getUserMappingStats() {
        try {
            const stats = await UserMapping.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        avgConfidence: { $avg: '$confidence' },
                        byResolution: {
                            $push: {
                                method: '$resolvedBy',
                                confidence: '$confidence'
                            }
                        },
                        domains: { $addToSet: '$domain' },
                        lastSeen: { $max: '$lastSeen' }
                    }
                },
                {
                    $project: {
                        total: 1,
                        avgConfidence: { $round: ['$avgConfidence', 1] },
                        domainCount: { $size: '$domains' },
                        lastSeen: 1,
                        resolutionStats: {
                            $reduce: {
                                input: '$byResolution',
                                initialValue: {},
                                in: {
                                    $let: {
                                        vars: { method: '$$this.method' },
                                        in: {
                                            $mergeObjects: [
                                                '$$value',
                                                {
                                                    $arrayToObject: [[
                                                        {
                                                            k: '$$method',
                                                            v: {
                                                                $add: [
                                                                    { $ifNull: [{ $getField: { field: '$$method', input: '$$value' } }, 0] },
                                                                    1
                                                                ]
                                                            }
                                                        }
                                                    ]]
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            ]);

            return stats[0] || {
                total: 0,
                avgConfidence: 0,
                domainCount: 0,
                resolutionStats: {},
                lastSeen: null
            };

        } catch (error) {
            console.error('Error getting user mapping stats:', error.message);
            return {
                total: 0,
                avgConfidence: 0,
                domainCount: 0,
                resolutionStats: {},
                lastSeen: null,
                error: error.message
            };
        }
    }

    // Clean up old chat messages (older than 2 months)
    async cleanupOldChatMessages() {
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        try {
            console.log(`🗑️ Removing chat messages older than ${twoMonthsAgo.toISOString()}`);

            // Find chats with old messages and remove those messages
            const updateResult = await Chat.updateMany(
                {
                    'messages.createTime': { $lt: twoMonthsAgo }
                },
                {
                    $pull: {
                        messages: {
                            createTime: { $lt: twoMonthsAgo }
                        }
                    }
                }
            );

            // Count how many messages were actually removed by checking the difference
            // This is an approximation since MongoDB doesn't return exact count of pulled elements
            const chatsWithOldMessages = await Chat.countDocuments({
                'messages.createTime': { $lt: twoMonthsAgo }
            });

            // Update message counts for affected chats
            await Chat.updateMany(
                { messageCount: { $gt: 0 } },
                [
                    {
                        $set: {
                            messageCount: { $size: '$messages' },
                            lastMessageTime: {
                                $cond: {
                                    if: { $gt: [{ $size: '$messages' }, 0] },
                                    then: { $max: '$messages.createTime' },
                                    else: null
                                }
                            }
                        }
                    }
                ]
            );

            const results = {
                affectedChats: updateResult.modifiedCount || 0,
                deletedMessages: 'estimated', // MongoDB doesn't provide exact count
                cutoffDate: twoMonthsAgo,
                remainingOldMessages: chatsWithOldMessages
            };

            console.log(`✅ Chat cleanup completed: Messages older than 2 months removed from ${results.affectedChats} chats`);
            return results;

        } catch (error) {
            console.error('❌ Chat cleanup failed:', error.message);
            return {
                affectedChats: 0,
                deletedMessages: 0,
                error: error.message,
                cutoffDate: twoMonthsAgo
            };
        }
    }
}

// Export singleton instance
module.exports = new ChatSyncScheduler();
