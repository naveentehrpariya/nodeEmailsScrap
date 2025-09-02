require('dotenv').config();
const { google } = require('googleapis');
const keys = require('./dispatch.json');

async function exploreGmailChats() {
  try {
    const userEmail = 'naveendev@crossmilescarrier.com';
    
    // Setup Gmail API
    const auth = new google.auth.JWT(
      keys.client_email,
      null,
      keys.private_key,
      ['https://www.googleapis.com/auth/gmail.readonly'],
      userEmail
    );
    
    const gmail = google.gmail({ version: 'v1', auth });
    
    console.log('🔍 Exploring Gmail for chat messages...');
    
    // Try different queries to find chat messages
    const queries = [
      'label:chats',
      'from:chat-noreply@google.com',
      'subject:"Google Chat"',
      'has:chat',
      'in:chats'
    ];
    
    for (const query of queries) {
      console.log(`\n📧 Trying query: "${query}"`);
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10
        });
        
        const messages = response.data.messages || [];
        console.log(`   Found ${messages.length} messages`);
        
        if (messages.length > 0) {
          // Get details of first few messages
          for (let i = 0; i < Math.min(3, messages.length); i++) {
            const msg = messages[i];
            const details = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'full'
            });
            
            const headers = details.data.payload.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            
            console.log(`     Message ${i+1}:`);
            console.log(`       Subject: ${subject}`);
            console.log(`       From: ${from}`);
            console.log(`       To: ${to}`);
            
            // Try to extract body
            let body = '';
            if (details.data.payload.body?.data) {
              body = Buffer.from(details.data.payload.body.data, 'base64').toString();
            } else if (details.data.payload.parts) {
              for (const part of details.data.payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                  body = Buffer.from(part.body.data, 'base64').toString();
                  break;
                }
              }
            }
            
            console.log(`       Body snippet: ${body.substring(0, 200)}...`);
            console.log('');
          }
        }
        
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
    // Also try to get all labels to see what's available
    console.log('\n📋 Available Gmail labels:');
    try {
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];
      labels.forEach(label => {
        if (label.name.toLowerCase().includes('chat') || 
            label.name.toLowerCase().includes('hangout') ||
            label.type === 'system') {
          console.log(`   ${label.name} (${label.type}) - ${label.messagesTotal || 0} messages`);
        }
      });
    } catch (error) {
      console.log(`   Error getting labels: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error exploring Gmail chats:', error);
  }
}

exploreGmailChats();
