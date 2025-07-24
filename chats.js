const express = require('express');
const {google} = require('googleapis');

const app = express();
const PORT = 8080;

// Path to your service account key
const SERVICE_ACCOUNT_KEY_FILE = './keys.json';
// The admin user email for domain-wide delegation
const ADMIN_USER_EMAIL = 'naveendev@crossmilescarrier.com';

// Set up authentication
async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: [
      'https://www.googleapis.com/auth/chat.spaces',
      'https://www.googleapis.com/auth/chat.messages.readonly',
    ]
  });

  // Create JWT client and impersonate an admin user
  const authClient = await auth.getClient();
  authClient.subject = ADMIN_USER_EMAIL;
  return authClient;
}

async function getChatService() {
  try {
    const auth = await getAuth();
    const chat = google.chat({version: 'v1', auth});

    // List DM spaces
    const spacesRes = await chat.spaces.list({
      // parent: 'spaces/AAA...',
      // useAdminAccess: true,
      pageSize: 100, // or whatever params you need
    });

    // For demonstration, fetch messages from the first DM space
    const dmSpace = spacesRes.data.spaces && spacesRes.data.spaces[0];
    if (!dmSpace) {
      return res.status(404).send('No DM spaces found.');
    }

    const messagesRes = await chat.spaces.messages.list({
      parent: dmSpace.name,
      useAdminAccess: true,
      pageSize: 50,
    });
  } catch (err) {
    console.error(err.toString());
  }
}
getChatService();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
