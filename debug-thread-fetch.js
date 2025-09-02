const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const Thread = require('./db/Thread');
    const Email = require('./db/Email');
    const Account = require('./db/Account'); // Need this for populate to work
    
    // Test with the thread that we know has attachments
    const threadId = '68af1afc953c2917df9ef5c7';
    
    console.log(`🔍 Testing thread lookup for ID: ${threadId}`);
    
    // Step 1: Check if thread exists
    const thread = await Thread.findOne({
      _id: threadId,
      deletedAt: null
    }).populate('account').lean();
    
    if (!thread) {
      console.log('❌ Thread not found or deleted');
      process.exit(1);
    }
    
    console.log('✅ Thread found:');
    console.log(`   Subject: ${thread.subject}`);
    console.log(`   Account: ${thread.account?.email || 'No account'}`);
    console.log(`   Account deleted: ${thread.account?.deletedAt ? 'Yes' : 'No'}`);
    
    // Step 2: Check account status
    if (!thread.account || thread.account.deletedAt) {
      console.log('❌ Thread account not found or deleted');
      process.exit(1);
    }
    
    // Step 3: Get emails in thread
    const emails = await Email.find({
      thread: threadId,
      deletedAt: null
    }).sort({ createdAt: 1, date: 1 }).lean();
    
    console.log(`📧 Found ${emails.length} emails in thread`);
    
    let totalAttachments = 0;
    emails.forEach((email, idx) => {
      const attachmentCount = email.attachments ? email.attachments.length : 0;
      totalAttachments += attachmentCount;
      console.log(`  ${idx + 1}. Subject: ${email.subject || '(No Subject)'}`);
      console.log(`     From: ${email.from}`);
      console.log(`     Label: ${email.labelType}`);
      console.log(`     Attachments: ${attachmentCount}`);
      
      if (attachmentCount > 0) {
        email.attachments.forEach((att, attIdx) => {
          console.log(`       ${attIdx + 1}. ${att.filename} (${att.mimeType})`);
          console.log(`          Path: ${att.localPath}`);
          console.log(`          Size: ${att.size}`);
          console.log(`          ID: ${att._id}`);
        });
      }
    });
    
    console.log(`\\n📎 Total attachments: ${totalAttachments}`);
    
    // Step 4: Simulate the API response
    const apiResponse = {
      status: true,
      message: "Thread fetched successfully",
      data: {
        ...thread,
        emails: emails
      }
    };
    
    console.log('\\n🔍 Simulated API Response:');
    console.log(`   Status: ${apiResponse.status}`);
    console.log(`   Message: ${apiResponse.message}`);
    console.log(`   Thread Subject: ${apiResponse.data.subject}`);
    console.log(`   Emails Count: ${apiResponse.data.emails.length}`);
    console.log(`   Total Attachments in Response: ${apiResponse.data.emails.reduce((sum, email) => sum + (email.attachments ? email.attachments.length : 0), 0)}`);
    
    if (totalAttachments > 0) {
      console.log('\\n✅ SUCCESS: The backend data contains attachments!');
      console.log('   The getSingleThread API should be working correctly.');
      console.log('   The issue might be in the frontend or authentication.');
    } else {
      console.log('\\n❌ ISSUE: No attachments found in the backend data');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
