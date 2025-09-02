const mongoose = require('mongoose');
require('dotenv').config();
const { getSingleThread } = require('./controllers/emailController');

// Mock Express request and response objects
const createMockReq = (threadId) => ({
  params: { threadId }
});

const createMockRes = () => {
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
};

const createMockNext = () => (error) => {
  if (error) {
    console.error('Error from next():', error.message);
  }
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test with a thread that we know has attachments from earlier query
    const threadId = '68af1afc953c2917df9ef5c7'; // This had 2 emails with attachments
    
    console.log(`🔍 Testing getSingleThread with threadId: ${threadId}`);
    
    const req = createMockReq(threadId);
    const res = createMockRes();
    const next = createMockNext();
    
    await getSingleThread(req, res, next);
    
    if (res.statusCode === 200) {
      console.log('✅ API call successful');
      console.log(`📧 Thread subject: ${res.jsonData.data.subject}`);
      console.log(`📨 Number of emails: ${res.jsonData.data.emails.length}`);
      
      let totalAttachments = 0;
      res.jsonData.data.emails.forEach((email, idx) => {
        const attachmentCount = email.attachments ? email.attachments.length : 0;
        totalAttachments += attachmentCount;
        console.log(`  ${idx + 1}. ${email.subject || '(No Subject)'} - ${attachmentCount} attachments`);
        
        if (attachmentCount > 0) {
          email.attachments.forEach((att, attIdx) => {
            console.log(`     ${attIdx + 1}. ${att.filename} (${att.mimeType})`);
          });
        }
      });
      
      console.log(`📎 Total attachments in API response: ${totalAttachments}`);
      
      if (totalAttachments > 0) {
        console.log('✅ SUCCESS: Attachments are present in the API response!');
      } else {
        console.log('❌ ISSUE: No attachments found in API response');
      }
    } else {
      console.log('❌ API call failed');
      console.log('Status:', res.statusCode);
      console.log('Response:', res.jsonData);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
