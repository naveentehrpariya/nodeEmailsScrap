const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

/**
 * Media Cleanup Service
 * 
 * Automatically removes media files older than 6 months to free up disk space.
 * Runs daily at 2:00 AM to clean up old attachments.
 * 
 * Features:
 * - Configurable retention period (default: 6 months)
 * - Safe deletion with backup logging
 * - Statistics tracking
 * - Manual cleanup trigger
 * - Whitelist protection for important files
 */
class MediaCleanupService {
    constructor() {
        this.mediaDirectory = path.join(__dirname, '../media');
        this.chatMediaDirectory = path.join(__dirname, '../media/chat-attachments');
        this.emailMediaDirectory = path.join(__dirname, '../media/email-attachments');
        this.uploadsDirectory = path.join(__dirname, '../uploads');
        
        // Default retention period: 6 months
        this.retentionDays = 180; // 6 months * 30 days
        this.scheduledTask = null;
        this.isRunning = false;
        
        // Protected files that should never be deleted
        this.protectedFiles = ['.gitkeep', 'README.md', '.DS_Store'];
        
        // Statistics
        this.lastCleanupDate = null;
        this.totalFilesDeleted = 0;
        this.totalSpaceFreed = 0;
        this.lastCleanupStats = null;
    }

    // Start the cleanup scheduler
    start() {
        if (this.scheduledTask) {
            console.log('⚠️ Media cleanup scheduler is already running');
            return false;
        }

        // Schedule cleanup daily at 2:00 AM
        this.scheduledTask = cron.schedule('0 2 * * *', async () => {
            console.log('🧹 Scheduled media cleanup started at 2:00 AM');
            await this.runCleanup();
        }, {
            scheduled: false,
            timezone: 'America/New_York'
        });

        this.scheduledTask.start();
        console.log('📅 Media cleanup scheduler started - will run daily at 2:00 AM');
        console.log(`🗂️ Will delete files older than ${this.retentionDays} days (${Math.round(this.retentionDays/30)} months)`);
        
        return true;
    }

    // Stop the cleanup scheduler
    stop() {
        if (this.scheduledTask) {
            this.scheduledTask.stop();
            this.scheduledTask = null;
            console.log('⏹️ Media cleanup scheduler stopped');
            return true;
        }
        return false;
    }

    // Set custom retention period
    setRetentionPeriod(days) {
        this.retentionDays = days;
        console.log(`📅 Media cleanup retention period set to ${days} days (${Math.round(days/30)} months)`);
    }

    // Check if file should be protected from deletion
    isProtectedFile(filename) {
        return this.protectedFiles.some(protectedFile => 
            filename.toLowerCase().includes(protectedFile.toLowerCase())
        );
    }

    // Check if file is older than retention period
    isFileOld(fileStat) {
        const now = new Date();
        const fileAge = now - fileStat.mtime;
        const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;
        return fileAge > retentionMs;
    }

    // Get file age in a readable format
    getFileAge(fileStat) {
        const now = new Date();
        const ageMs = now - fileStat.mtime;
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        
        if (ageDays < 30) {
            return `${ageDays} days`;
        } else if (ageDays < 365) {
            const months = Math.floor(ageDays / 30);
            return `${months} month${months > 1 ? 's' : ''}`;
        } else {
            const years = Math.floor(ageDays / 365);
            const remainingDays = ageDays % 365;
            const months = Math.floor(remainingDays / 30);
            return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
        }
    }

    // Clean up files in a specific directory
    async cleanupDirectory(dirPath, dirName = '') {
        const stats = {
            dirName: dirName || path.basename(dirPath),
            totalFiles: 0,
            oldFiles: 0,
            protectedFiles: 0,
            deletedFiles: 0,
            failedDeletes: 0,
            spaceFreed: 0,
            errors: []
        };

        try {
            // Check if directory exists
            try {
                await fs.access(dirPath);
            } catch (error) {
                console.log(`📁 Directory ${dirPath} does not exist, skipping...`);
                return stats;
            }

            const files = await fs.readdir(dirPath);
            console.log(`🔍 Scanning ${files.length} files in ${stats.dirName}...`);
            
            for (const filename of files) {
                const filePath = path.join(dirPath, filename);
                
                try {
                    const fileStat = await fs.stat(filePath);
                    
                    // Skip directories
                    if (fileStat.isDirectory()) {
                        continue;
                    }
                    
                    stats.totalFiles++;
                    
                    // Check if file is protected
                    if (this.isProtectedFile(filename)) {
                        stats.protectedFiles++;
                        console.log(`🛡️ Protected file skipped: ${filename}`);
                        continue;
                    }
                    
                    // Check if file is old enough for deletion
                    if (this.isFileOld(fileStat)) {
                        stats.oldFiles++;
                        const fileAge = this.getFileAge(fileStat);
                        const fileSize = fileStat.size;
                        
                        try {
                            await fs.unlink(filePath);
                            stats.deletedFiles++;
                            stats.spaceFreed += fileSize;
                            
                            console.log(`🗑️ Deleted: ${filename} (age: ${fileAge}, size: ${(fileSize/1024/1024).toFixed(2)}MB)`);
                        } catch (deleteError) {
                            stats.failedDeletes++;
                            stats.errors.push(`Failed to delete ${filename}: ${deleteError.message}`);
                            console.error(`❌ Failed to delete ${filename}:`, deleteError.message);
                        }
                    }
                } catch (statError) {
                    stats.errors.push(`Failed to stat ${filename}: ${statError.message}`);
                    console.error(`❌ Failed to stat ${filename}:`, statError.message);
                }
            }
            
        } catch (error) {
            stats.errors.push(`Failed to read directory ${dirPath}: ${error.message}`);
            console.error(`❌ Failed to read directory ${dirPath}:`, error.message);
        }
        
        return stats;
    }

    // Run full cleanup across all media directories
    async runCleanup() {
        if (this.isRunning) {
            console.log('⚠️ Cleanup is already running, skipping...');
            return this.lastCleanupStats;
        }

        this.isRunning = true;
        const startTime = new Date();
        
        console.log('🧹 Starting media cleanup...');
        console.log(`📅 Deleting files older than ${this.retentionDays} days (${Math.round(this.retentionDays/30)} months)`);
        
        const allStats = {
            startTime,
            retentionDays: this.retentionDays,
            directories: [],
            totals: {
                totalFiles: 0,
                oldFiles: 0,
                protectedFiles: 0,
                deletedFiles: 0,
                failedDeletes: 0,
                spaceFreed: 0,
                errors: []
            }
        };

        try {
            // Clean up different media directories
            const directoriesToClean = [
                { path: this.mediaDirectory, name: 'General Media' },
                { path: this.chatMediaDirectory, name: 'Chat Attachments' },
                { path: this.emailMediaDirectory, name: 'Email Attachments' },
                { path: this.uploadsDirectory, name: 'Uploads' }
            ];

            for (const dir of directoriesToClean) {
                console.log(`\n📂 Cleaning ${dir.name} (${dir.path})`);
                const dirStats = await this.cleanupDirectory(dir.path, dir.name);
                allStats.directories.push(dirStats);
                
                // Update totals
                allStats.totals.totalFiles += dirStats.totalFiles;
                allStats.totals.oldFiles += dirStats.oldFiles;
                allStats.totals.protectedFiles += dirStats.protectedFiles;
                allStats.totals.deletedFiles += dirStats.deletedFiles;
                allStats.totals.failedDeletes += dirStats.failedDeletes;
                allStats.totals.spaceFreed += dirStats.spaceFreed;
                allStats.totals.errors.push(...dirStats.errors);
                
                console.log(`   📊 ${dir.name}: ${dirStats.deletedFiles}/${dirStats.oldFiles} old files deleted, ${(dirStats.spaceFreed/1024/1024).toFixed(2)}MB freed`);
            }

            // Update global statistics
            this.lastCleanupDate = startTime;
            this.totalFilesDeleted += allStats.totals.deletedFiles;
            this.totalSpaceFreed += allStats.totals.spaceFreed;
            
            const endTime = new Date();
            const duration = Math.round((endTime - startTime) / 1000);
            allStats.endTime = endTime;
            allStats.duration = duration;
            
            // Log summary
            console.log('\n✅ Media cleanup completed!');
            console.log(`⏱️ Duration: ${duration} seconds`);
            console.log(`📁 Directories scanned: ${allStats.directories.length}`);
            console.log(`📄 Total files scanned: ${allStats.totals.totalFiles}`);
            console.log(`⏰ Old files found: ${allStats.totals.oldFiles}`);
            console.log(`🛡️ Protected files: ${allStats.totals.protectedFiles}`);
            console.log(`🗑️ Files deleted: ${allStats.totals.deletedFiles}`);
            console.log(`💾 Space freed: ${(allStats.totals.spaceFreed/1024/1024).toFixed(2)}MB`);
            
            if (allStats.totals.failedDeletes > 0) {
                console.log(`❌ Failed deletions: ${allStats.totals.failedDeletes}`);
            }
            
            if (allStats.totals.errors.length > 0) {
                console.log(`⚠️ Errors encountered: ${allStats.totals.errors.length}`);
                allStats.totals.errors.forEach(error => console.log(`   - ${error}`));
            }
            
            this.lastCleanupStats = allStats;
            return allStats;
            
        } catch (error) {
            console.error('❌ Media cleanup failed:', error);
            allStats.error = error.message;
            this.lastCleanupStats = allStats;
            return allStats;
        } finally {
            this.isRunning = false;
        }
    }

    // Manual cleanup trigger
    async triggerManualCleanup() {
        console.log('🔄 Manual media cleanup triggered');
        return await this.runCleanup();
    }

    // Get cleanup statistics
    getStats() {
        return {
            isSchedulerRunning: !!this.scheduledTask,
            isCleanupRunning: this.isRunning,
            retentionDays: this.retentionDays,
            retentionMonths: Math.round(this.retentionDays / 30),
            lastCleanupDate: this.lastCleanupDate,
            totalFilesDeleted: this.totalFilesDeleted,
            totalSpaceFreed: this.totalSpaceFreed,
            totalSpaceFreedMB: Math.round(this.totalSpaceFreed / 1024 / 1024 * 100) / 100,
            lastCleanupStats: this.lastCleanupStats,
            schedule: 'Daily at 2:00 AM'
        };
    }

    // Get directory sizes for monitoring
    async getDirectorySizes() {
        const directories = [
            { path: this.mediaDirectory, name: 'General Media' },
            { path: this.chatMediaDirectory, name: 'Chat Attachments' },
            { path: this.emailMediaDirectory, name: 'Email Attachments' },
            { path: this.uploadsDirectory, name: 'Uploads' }
        ];

        const sizes = [];

        for (const dir of directories) {
            try {
                await fs.access(dir.path);
                const files = await fs.readdir(dir.path);
                let totalSize = 0;
                let fileCount = 0;
                let oldFileCount = 0;

                for (const filename of files) {
                    const filePath = path.join(dir.path, filename);
                    try {
                        const fileStat = await fs.stat(filePath);
                        if (fileStat.isFile()) {
                            totalSize += fileStat.size;
                            fileCount++;
                            if (this.isFileOld(fileStat)) {
                                oldFileCount++;
                            }
                        }
                    } catch (error) {
                        // Skip files we can't stat
                    }
                }

                sizes.push({
                    name: dir.name,
                    path: dir.path,
                    exists: true,
                    fileCount,
                    oldFileCount,
                    totalSize,
                    totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
                });
            } catch (error) {
                sizes.push({
                    name: dir.name,
                    path: dir.path,
                    exists: false,
                    fileCount: 0,
                    oldFileCount: 0,
                    totalSize: 0,
                    totalSizeMB: 0
                });
            }
        }

        return sizes;
    }

    // Preview what would be deleted without actually deleting
    async previewCleanup() {
        console.log('👀 Preview mode: Showing what would be deleted...');
        
        const originalRetentionDays = this.retentionDays;
        const previewStats = await this.runPreviewCleanup();
        
        return previewStats;
    }

    // Preview cleanup without actual deletion
    async runPreviewCleanup() {
        const startTime = new Date();
        
        console.log('🔍 Previewing media cleanup...');
        console.log(`📅 Files older than ${this.retentionDays} days (${Math.round(this.retentionDays/30)} months) would be deleted`);
        
        const allStats = {
            preview: true,
            startTime,
            retentionDays: this.retentionDays,
            directories: [],
            totals: {
                totalFiles: 0,
                oldFiles: 0,
                protectedFiles: 0,
                wouldDeleteFiles: 0,
                spaceWouldFree: 0
            }
        };

        const directoriesToClean = [
            { path: this.mediaDirectory, name: 'General Media' },
            { path: this.chatMediaDirectory, name: 'Chat Attachments' },
            { path: this.emailMediaDirectory, name: 'Email Attachments' },
            { path: this.uploadsDirectory, name: 'Uploads' }
        ];

        for (const dir of directoriesToClean) {
            const dirStats = await this.previewDirectoryCleanup(dir.path, dir.name);
            allStats.directories.push(dirStats);
            
            // Update totals
            allStats.totals.totalFiles += dirStats.totalFiles;
            allStats.totals.oldFiles += dirStats.oldFiles;
            allStats.totals.protectedFiles += dirStats.protectedFiles;
            allStats.totals.wouldDeleteFiles += dirStats.wouldDeleteFiles;
            allStats.totals.spaceWouldFree += dirStats.spaceWouldFree;
        }

        console.log('\n👀 Preview completed!');
        console.log(`📄 Total files: ${allStats.totals.totalFiles}`);
        console.log(`⏰ Old files: ${allStats.totals.oldFiles}`);
        console.log(`🛡️ Protected files: ${allStats.totals.protectedFiles}`);
        console.log(`🗑️ Would delete: ${allStats.totals.wouldDeleteFiles} files`);
        console.log(`💾 Would free: ${(allStats.totals.spaceWouldFree/1024/1024).toFixed(2)}MB`);

        return allStats;
    }

    // Preview cleanup for a specific directory
    async previewDirectoryCleanup(dirPath, dirName) {
        const stats = {
            dirName: dirName || path.basename(dirPath),
            totalFiles: 0,
            oldFiles: 0,
            protectedFiles: 0,
            wouldDeleteFiles: 0,
            spaceWouldFree: 0
        };

        try {
            await fs.access(dirPath);
            const files = await fs.readdir(dirPath);
            
            for (const filename of files) {
                const filePath = path.join(dirPath, filename);
                
                try {
                    const fileStat = await fs.stat(filePath);
                    
                    if (fileStat.isFile()) {
                        stats.totalFiles++;
                        
                        if (this.isProtectedFile(filename)) {
                            stats.protectedFiles++;
                        } else if (this.isFileOld(fileStat)) {
                            stats.oldFiles++;
                            stats.wouldDeleteFiles++;
                            stats.spaceWouldFree += fileStat.size;
                        }
                    }
                } catch (error) {
                    // Skip files we can't stat
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't access
        }

        return stats;
    }
}

// Export singleton instance
module.exports = new MediaCleanupService();
