const { google } = require('googleapis');
const keys = require('./dispatch.json');

const DOMAIN = "crossmilescarrier.com";
const TEST_USER_EMAIL = "naveendev@crossmilescarrier.com";

async function testPeopleAPI() {
    console.log('🔍 Testing People API for User Resolution...\n');
    const SCOPES = [
        "https://www.googleapis.com/auth/chat.spaces.readonly",
        "https://www.googleapis.com/auth/chat.messages.readonly",
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/directory.readonly",
    ];

    const auth = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        SCOPES,
        TEST_USER_EMAIL
    );

    try {
        // Test different Google APIs for user resolution
        console.log('1. Testing People API...');
        try {
            const people = google.people({ version: 'v1', auth });
            
            // Try to get the current user's connections/contacts
            const res = await people.people.connections.list({
                resourceName: 'people/me',
                personFields: 'names,emailAddresses',
                pageSize: 10
            });
            
            console.log(`✅ People API works! Found ${res.data.connections?.length || 0} connections`);
            
            if (res.data.connections && res.data.connections.length > 0) {
                res.data.connections.slice(0, 3).forEach((connection, index) => {
                    const name = connection.names?.[0]?.displayName || 'Unknown';
                    const email = connection.emailAddresses?.[0]?.value || 'No email';
                    console.log(`  ${index + 1}. ${name} - ${email}`);
                });
            }
            
        } catch (peopleError) {
            console.log(`⚠️ People API failed: ${peopleError.message}`);
        }
        
        console.log('\n2. Testing Gmail API for contacts...');
        try {
            const gmail = google.gmail({ version: 'v1', auth });
            
            // Get recent messages to see sender information
            const res = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 5
            });
            
            console.log(`✅ Gmail API works! Found ${res.data.messages?.length || 0} messages`);
            
        } catch (gmailError) {
            console.log(`⚠️ Gmail API failed: ${gmailError.message}`);
        }
        
        console.log('\n3. Testing Contacts API...');
        try {
            const contacts = google.people({ version: 'v1', auth });
            
            // List other contacts
            const res = await contacts.otherContacts.list({
                pageSize: 10,
                readMask: 'names,emailAddresses'
            });
            
            console.log(`✅ Other Contacts API works! Found ${res.data.otherContacts?.length || 0} contacts`);
            
        } catch (contactsError) {
            console.log(`⚠️ Other Contacts API failed: ${contactsError.message}`);
        }

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
    }
}

// Run the test
testPeopleAPI().catch(console.error);
