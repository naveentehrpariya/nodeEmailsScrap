const mongoose = require('mongoose');
const Account = require('./db/Account');
const Thread = require('./db/Thread');
const Email = require('./db/Email');

async function checkConversations() {
    try {
        await mongoose.connect('mongodb://localhost:27017/emailscrap');
        console.log('✅ Connected to MongoDB');

        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        
        console.log('🧵 CONVERSATION ANALYSIS:');
        console.log('=========================');
        
        // Find threads that have both INBOX and SENT emails (conversations)
        const conversationThreads = await Thread.aggregate([
            { $match: { account: account._id } },
            {
                $lookup: {
                    from: 'emails',
                    localField: '_id',
                    foreignField: 'thread',
                    as: 'emails'
                }
            },
            {
                $addFields: {
                    hasInbox: { $in: ['INBOX', '$emails.labelType'] },
                    hasSent: { $in: ['SENT', '$emails.labelType'] },
                    emailCount: { $size: '$emails' }
                }
            },
            {
                $match: {
                    $and: [
                        { hasInbox: true },
                        { hasSent: true }
                    ]
                }
            }
        ]);
        
        console.log(`💬 Found ${conversationThreads.length} conversation threads (with both inbox & sent):`);
        
        conversationThreads.forEach((thread, i) => {
            const inboxEmails = thread.emails.filter(e => e.labelType === 'INBOX').length;
            const sentEmails = thread.emails.filter(e => e.labelType === 'SENT').length;
            
            console.log(`\n${i+1}. 📧 ${thread.subject}`);
            console.log(`   🆔 Thread ID: ${thread.threadId}`);
            console.log(`   📨 Total: ${thread.emailCount} emails (${inboxEmails} inbox, ${sentEmails} sent)`);
            console.log(`   ✅ TRUE CONVERSATION THREAD`);
        });
        
        if (conversationThreads.length > 0) {
            console.log(`\n🎉 SUCCESS! Unified threading is working!`);
            console.log(`   ✅ Emails are now properly grouped by Gmail threadId`);
            console.log(`   ✅ INBOX and SENT emails appear in the same conversation`);
        } else {
            console.log(`\n⚠️ No conversation threads found`);
            console.log(`   (This may be normal if there are no back-and-forth conversations)`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

checkConversations();
