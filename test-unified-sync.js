const mongoose = require('mongoose');
const EmailSyncService = require('./services/emailSyncService');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');

async function testUnifiedSync() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/emailscrap');
        console.log('✅ Connected to MongoDB');

        // Find the naveendev account (most likely to work)
        const account = await Account.findOne({ 
            email: 'naveendev@crossmilescarrier.com',
            deletedAt: { $exists: false } 
        });

        if (!account) {
            console.log('❌ No accounts found');
            return;
        }

        console.log(`\n🔄 Testing unified sync for: ${account.email}`);
        console.log('=' .repeat(50));

        // Get thread count before sync
        const threadsBefore = await Thread.countDocuments({
            account: account._id,
            deletedAt: { $exists: false }
        });

        const emailsBefore = await Email.countDocuments({
            thread: { $in: await Thread.find({
                account: account._id,
                deletedAt: { $exists: false }
            }).distinct('_id') },
            deletedAt: { $exists: false }
        });

        console.log(`📊 Before sync: ${threadsBefore} threads, ${emailsBefore} emails`);

        // Run unified sync
        const result = await EmailSyncService.syncAccountEmailsUnified(account, 50); // Test with 50 messages

        // Get thread count after sync
        const threadsAfter = await Thread.countDocuments({
            account: account._id,
            deletedAt: { $exists: false }
        });

        const emailsAfter = await Email.countDocuments({
            thread: { $in: await Thread.find({
                account: account._id,
                deletedAt: { $exists: false }
            }).distinct('_id') },
            deletedAt: { $exists: false }
        });

        console.log(`📊 After sync: ${threadsAfter} threads, ${emailsAfter} emails`);

        // Detailed analysis of threading
        console.log('\n🧵 THREAD ANALYSIS:');
        console.log('=' .repeat(50));
        
        const threads = await Thread.find({
            account: account._id,
            deletedAt: { $exists: false }
        }).populate('account').lean();

        for (const thread of threads.slice(0, 10)) { // Show first 10 threads
            const threadEmails = await Email.find({
                thread: thread._id,
                deletedAt: { $exists: false }
            }).lean();

            const inboxEmails = threadEmails.filter(e => e.labelType === 'INBOX').length;
            const sentEmails = threadEmails.filter(e => e.labelType === 'SENT').length;

            console.log(`📧 Thread: ${thread.subject}`);
            console.log(`   🆔 ID: ${thread.threadId}`);
            console.log(`   📨 Emails: ${threadEmails.length} total (${inboxEmails} inbox, ${sentEmails} sent)`);
            
            if (inboxEmails > 0 && sentEmails > 0) {
                console.log(`   ✅ CONVERSATION THREAD (has both inbox and sent)`);
            } else if (threadEmails.length > 1) {
                console.log(`   🟡 MULTI-EMAIL THREAD (${threadEmails.length} emails, same label)`);
            } else {
                console.log(`   ⚪ SINGLE EMAIL THREAD`);
            }
            console.log('');
        }

        // Summary
        const conversationThreads = await Thread.aggregate([
            { $match: { account: account._id, deletedAt: { $exists: false } } },
            {
                $lookup: {
                    from: 'emails',
                    localField: '_id',
                    foreignField: 'thread',
                    as: 'emails'
                }
            },
            {
                $match: {
                    $and: [
                        { 'emails.labelType': 'INBOX' },
                        { 'emails.labelType': 'SENT' }
                    ]
                }
            }
        ]);

        console.log('🏁 SYNC SUMMARY:');
        console.log('=' .repeat(50));
        console.log(`✅ Sync Result: ${result.inboxCount} inbox + ${result.sentCount} sent = ${result.total} total emails`);
        console.log(`🧵 Total Threads: ${threadsAfter}`);
        console.log(`📧 Total Emails: ${emailsAfter}`);
        console.log(`💬 Conversation Threads: ${conversationThreads.length} (with both inbox & sent emails)`);
        console.log(`📈 Threading Efficiency: ${((emailsAfter / threadsAfter) || 0).toFixed(2)} emails per thread`);

        if (conversationThreads.length > 0) {
            console.log('✅ SUCCESS: Found conversation threads with unified inbox+sent emails!');
        } else {
            console.log('⚠️  WARNING: No conversation threads found (may be normal if no back-and-forth emails)');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

testUnifiedSync();
