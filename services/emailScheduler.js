const cron = require('node-cron');
const emailSyncService = require('./emailSyncService');

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
            console.log('⏰ Scheduled email sync started at 7:00 PM');
            await this.runScheduledSync();
        }, {
            scheduled: false, // Don't start immediately
            timezone: 'America/New_York' // Adjust timezone as needed
        });

        this.scheduledTask.start();
        console.log('📅 Email scheduler started - will run daily at 7:00 PM');
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
            console.log('🚀 Starting scheduled email synchronization...');
            const results = await emailSyncService.syncAllAccounts();
            
            const endTime = new Date();
            const duration = Math.round((endTime - startTime) / 1000);

            console.log(`✅ Scheduled sync completed in ${duration} seconds`);
            console.log(`📊 Processed ${results.length} accounts`);
            
            // Log summary
            const successCount = results.filter(r => r.success).length;
            const failureCount = results.filter(r => !r.success).length;
            const totalEmails = results.reduce((sum, r) => sum + (r.total || 0), 0);

            console.log(`📈 Sync Summary: ${successCount} successful, ${failureCount} failed, ${totalEmails} total emails processed`);

            return {
                success: true,
                duration,
                results,
                totalEmails,
                successCount,
                failureCount
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
}

module.exports = new EmailScheduler();
