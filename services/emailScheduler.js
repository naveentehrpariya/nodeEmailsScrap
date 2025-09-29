const cron = require('node-cron');
const emailSyncService = require('./emailSyncService');
const chatSyncService = require('./optimizedChatSyncService'); // Use optimized service - NO MORE GOOGLE API ERRORS!
const Email = require('../db/Email');
const Thread = require('../db/Thread');

class EmailScheduler {
    constructor() {
        this.scheduledTask = null;
        this.isRunning = false;
    }

    // Start the scheduler (runs at 7 PM daily)
    start() {
        if (this.scheduledTask) {
            console.log('⚠️ Scheduler is already running');
            return;
        }

        // Schedule for 7:00 PM daily (19:00 in 24-hour format)
        // Cron format: minute hour day month dayOfWeek
        this.scheduledTask = cron.schedule('0 19 * * *', async () => {
            console.log('⏰ Scheduled sync started at 7:00 PM (Emails + Chats)');
            await this.runScheduledSync();
        }, {
            scheduled: false, // Don't start immediately
            timezone: 'America/New_York' // Adjust timezone as needed
        });

        this.scheduledTask.start();
        console.log('📅 Email & Chat scheduler started - will run daily at 7:00 PM');
    }

    // Stop the scheduler
    stop() {
        if (this.scheduledTask) {
            this.scheduledTask.stop();
            this.scheduledTask = null;
            console.log('⏹️ Email scheduler stopped');
        }
    }

    // Get scheduler status
    getStatus() {
        return {
            isScheduled: !!this.scheduledTask,
            isRunning: this.isRunning,
            nextRun: this.scheduledTask ? 'Daily at 7:00 PM' : 'Not scheduled'
        };
    }

    // Run the scheduled sync
    async runScheduledSync() {
        if (this.isRunning) {
            console.log('⚠️ Sync is already running, skipping this scheduled run');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();

        try {
            console.log('🚀 Starting scheduled synchronization (Emails + Chats + Cleanup)...');
            
            // First, clean up old emails and threads (older than 1 month)
            console.log('🧹 Starting database cleanup (removing emails/threads older than 1 month)...');
            const cleanupResults = await this.cleanupOldData();
            
            // Sync emails first
            console.log('📧 Starting email synchronization...');
            const emailResults = await emailSyncService.syncAllAccounts();
            
            // Then sync chats with optimized service (no Google API errors)
            console.log('💬 Starting optimized chat synchronization...');
            const chatResults = await chatSyncService.syncAllChats();
            
            const endTime = new Date();
            const duration = Math.round((endTime - startTime) / 1000);

            console.log(`✅ Scheduled sync completed in ${duration} seconds`);
            console.log(`📊 Processed ${emailResults.length} accounts`);
            
            // Cleanup summary
            console.log(`🗑️ Cleanup Summary: ${cleanupResults.deletedEmails} emails, ${cleanupResults.deletedThreads} threads removed`);
            
            // Email summary
            const emailSuccessCount = emailResults.filter(r => r.success).length;
            const emailFailureCount = emailResults.filter(r => !r.success).length;
            const totalEmails = emailResults.reduce((sum, r) => sum + (r.total || 0), 0);

            // Chat summary 
            const chatSuccessCount = chatResults.filter(r => r.success).length;
            const chatFailureCount = chatResults.filter(r => !r.success).length;
            const totalChats = chatResults.reduce((sum, r) => sum + (r.syncedChats || 0), 0);
            const totalMessages = chatResults.reduce((sum, r) => sum + (r.syncedMessages || 0), 0);

            console.log(`📈 Email Sync Summary: ${emailSuccessCount} successful, ${emailFailureCount} failed, ${totalEmails} total emails processed`);
            console.log(`💬 Chat Sync Summary: ${chatSuccessCount} successful, ${chatFailureCount} failed, ${totalChats} chats, ${totalMessages} messages`);

            return {
                success: true,
                duration,
                cleanupResults,
                emailResults,
                chatResults,
                totals: {
                    emails: totalEmails,
                    chats: totalChats,
                    messages: totalMessages
                },
                emailSuccessCount,
                emailFailureCount,
                chatSuccessCount,
                chatFailureCount
            };

        } catch (error) {
            const endTime = new Date();
            const duration = Math.round((endTime - startTime) / 1000);
            
            console.error('❌ Scheduled sync failed:', error.message);
            console.error(`⏱️ Failed after ${duration} seconds`);

            return {
                success: false,
                error: error.message,
                duration
            };

        } finally {
            this.isRunning = false;
        }
    }

    // Manual trigger for testing
    async triggerManualSync() {
        console.log('🔄 Manual sync triggered');
        return await this.runScheduledSync();
    }

    // Set custom schedule (for testing or different time zones)
    setCustomSchedule(cronExpression) {
        if (this.scheduledTask) {
            this.stop();
        }

        this.scheduledTask = cron.schedule(cronExpression, async () => {
            console.log(`⏰ Custom scheduled email sync started: ${cronExpression}`);
            await this.runScheduledSync();
        }, {
            scheduled: false,
            timezone: 'America/New_York'
        });

        this.scheduledTask.start();
        console.log(`📅 Custom email scheduler started with expression: ${cronExpression}`);
    }

    // Validate cron expression
    validateCronExpression(expression) {
        return cron.validate(expression);
    }

    // Clean up old emails and threads (older than 1 month)
    async cleanupOldData() {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        try {
            console.log(`🗑️ Removing emails and threads older than ${oneMonthAgo.toISOString()}`);

            // Delete old emails
            const emailDeleteResult = await Email.deleteMany({
                createdAt: { $lt: oneMonthAgo },
                deletedAt: null // Only delete non-soft-deleted emails
            });

            // Delete old threads
            const threadDeleteResult = await Thread.deleteMany({
                createdAt: { $lt: oneMonthAgo },
                deletedAt: null // Only delete non-soft-deleted threads
            });

            const results = {
                deletedEmails: emailDeleteResult.deletedCount || 0,
                deletedThreads: threadDeleteResult.deletedCount || 0,
                cutoffDate: oneMonthAgo
            };

            console.log(`✅ Database cleanup completed: ${results.deletedEmails} emails, ${results.deletedThreads} threads removed`);
            return results;

        } catch (error) {
            console.error('❌ Database cleanup failed:', error.message);
            return {
                deletedEmails: 0,
                deletedThreads: 0,
                error: error.message,
                cutoffDate: oneMonthAgo
            };
        }
    }
}

module.exports = new EmailScheduler();
