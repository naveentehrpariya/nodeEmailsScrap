const { google } = require('googleapis');
const keys = require('../dispatch.json');

class OAuthValidator {
    constructor() {
        this.REQUIRED_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
    }

    // Validate service account configuration
    validateServiceAccount() {
        const requiredKeys = [
            'client_email',
            'private_key', 
            'project_id',
            'client_id'
        ];

        const missing = requiredKeys.filter(key => !keys[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required service account keys: ${missing.join(', ')}`);
        }

        console.log('✅ Service account configuration is valid');
        console.log(`📧 Service account email: ${keys.client_email}`);
        console.log(`🆔 Client ID: ${keys.client_id}`);
        console.log(`📋 Project ID: ${keys.project_id}`);
    }

    // Test OAuth connection for a specific email
    async testConnection(email) {
        console.log(`🔐 Testing OAuth connection for: ${email}`);
        
        try {
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                this.REQUIRED_SCOPES,
                email
            );

            // Enable domain-wide delegation
            auth.subject = email;

            const gmail = google.gmail({ version: 'v1', auth });

            // Try to get user profile (simple test)
            const profile = await gmail.users.getProfile({
                userId: 'me'
            });

            console.log(`✅ OAuth connection successful for ${email}`);
            console.log(`📬 Email address: ${profile.data.emailAddress}`);
            console.log(`📊 Total messages: ${profile.data.messagesTotal}`);
            console.log(`🧵 Total threads: ${profile.data.threadsTotal}`);
            
            return true;

        } catch (error) {
            console.error(`❌ OAuth connection failed for ${email}:`, error.message);
            
            // Provide specific error guidance
            if (error.message.includes('unauthorized_client')) {
                console.log('\n🔧 OAuth Configuration Issues:');
                console.log('1. Domain-wide delegation may not be configured properly');
                console.log('2. The service account may not have the required scopes authorized');
                console.log('3. The email domain may not be managed by Google Workspace');
                console.log('\n📋 Required Steps:');
                console.log('1. Go to Google Workspace Admin Console');
                console.log('2. Navigate to Security > API Controls > Domain-wide Delegation');
                console.log(`3. Add client ID: ${keys.client_id}`);
                console.log('4. Add required scopes: https://www.googleapis.com/auth/gmail.readonly');
                console.log('5. Ensure the email domain is managed by Google Workspace (not personal Gmail)');
            }
            
            return false;
        }
    }

    // Check if an email domain supports service account access
    async checkDomainSupport(email) {
        const domain = email.split('@')[1];
        console.log(`🌐 Checking domain support for: ${domain}`);

        // Common domains that don't support service account delegation
        const unsupportedDomains = [
            'gmail.com',
            'googlemail.com',
            'yahoo.com',
            'hotmail.com',
            'outlook.com',
            'live.com'
        ];

        if (unsupportedDomains.includes(domain.toLowerCase())) {
            console.log(`⚠️  Domain ${domain} typically doesn't support service account delegation`);
            console.log('💡 Personal email accounts (Gmail, Yahoo, etc.) require OAuth2 flow with user consent');
            console.log('🏢 Service accounts work with Google Workspace managed domains');
            return false;
        }

        console.log(`✅ Domain ${domain} may support service account delegation`);
        return true;
    }

    // Generate OAuth URL for personal accounts (alternative approach)
    generatePersonalOAuthUrl(email) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/auth/google/callback'
        );

        const scopes = this.REQUIRED_SCOPES;
        
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            login_hint: email
        });

        console.log(`🔗 OAuth URL for personal account ${email}:`);
        console.log(authUrl);
        
        return authUrl;
    }

    // Comprehensive validation
    async validateConfiguration(email) {
        console.log('🚀 Starting OAuth configuration validation...\n');
        
        try {
            // 1. Validate service account
            this.validateServiceAccount();
            console.log('');

            // 2. Check domain support
            const domainSupported = await this.checkDomainSupport(email);
            console.log('');

            // 3. Test connection
            if (domainSupported) {
                const connected = await this.testConnection(email);
                return connected;
            } else {
                console.log('💡 Consider using OAuth2 flow for personal email accounts');
                this.generatePersonalOAuthUrl(email);
                return false;
            }

        } catch (error) {
            console.error('❌ Configuration validation failed:', error.message);
            return false;
        }
    }
}

module.exports = new OAuthValidator();
