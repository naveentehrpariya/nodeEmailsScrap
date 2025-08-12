# Google OAuth Setup Guide for Email Sync

## Current Issue
The error `unauthorized_client: Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested` indicates that **domain-wide delegation** is not properly configured.

## Service Account Details
- **Service Account Email**: `cmc-carriers@crossmilescarrier.iam.gserviceaccount.com`
- **Client ID**: `105726570480178168132`
- **Project ID**: `crossmilescarrier`
- **Required Scope**: `https://www.googleapis.com/auth/gmail.readonly`

## Solution: Configure Domain-wide Delegation

### Step 1: Access Google Workspace Admin Console
1. Go to [admin.google.com](https://admin.google.com)
2. Sign in as a **Super Admin** for the domain `internetbusinesssolutionsindia.com`
3. If you don't have Super Admin access, contact your Google Workspace administrator

### Step 2: Navigate to Domain-wide Delegation
1. In the Admin Console, go to **Security** → **Access and data control** → **API Controls**
2. Click on **Domain-wide delegation**
3. Click **Add new** (or **Manage Domain Wide Delegation**)

### Step 3: Add Service Account Authorization
Enter the following details:
- **Client ID**: `105726570480178168132`
- **OAuth scopes**: `https://www.googleapis.com/auth/gmail.readonly`

Click **Authorize** to save the configuration.

### Step 4: Verify Configuration
After completing the setup, run the test command:

```bash
node test-oauth.js
```

If successful, you should see:
```
🎉 SUCCESS: OAuth configuration is working correctly!
✅ You can now sync emails for this account.
```

## Important Notes

### Supported Email Types
- ✅ **Google Workspace Emails**: `user@yourdomain.com` (requires domain-wide delegation)
- ❌ **Personal Gmail**: `user@gmail.com` (not supported with service accounts)

### Domain Requirements
The domain `internetbusinesssolutionsindia.com` must be:
1. **Managed by Google Workspace** (not a personal Gmail account)
2. **Configured with domain-wide delegation** in Admin Console
3. **Accessible by a Super Admin** for configuration

### Security Considerations
- Service accounts have **read-only access** to Gmail (`gmail.readonly` scope)
- Domain-wide delegation should only be granted to **trusted applications**
- Regularly review and audit delegated access in Admin Console

## Troubleshooting

### Common Issues

**1. "unauthorized_client" Error**
- Verify domain-wide delegation is configured correctly
- Ensure the Client ID matches exactly: `105726570480178168132`
- Check that the scope is correct: `https://www.googleapis.com/auth/gmail.readonly`

**2. "Domain not found" Error**
- Confirm the domain is managed by Google Workspace
- Verify you have Super Admin access to the domain

**3. "Access denied" Error**
- Check that the service account has the correct permissions
- Verify the email address belongs to the configured domain

### Testing Commands

**Test OAuth Configuration:**
```bash
node test-oauth.js [email]
```

**Manual Email Sync:**
```bash
curl -X POST http://localhost:8080/account/naveen@internetbusinesssolutionsindia.com/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Alternative: OAuth2 Flow for Personal Accounts

If you need to sync personal Gmail accounts, you'll need to implement OAuth2 flow:

1. Create OAuth2 credentials in Google Cloud Console
2. Implement user consent flow
3. Store refresh tokens securely
4. Use OAuth2Client instead of JWT for authentication

Example OAuth2 setup:
```javascript
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:8080/auth/google/callback'
);
```

## Support

If you continue to experience issues:
1. Run `node test-oauth.js` to diagnose the problem
2. Check the Google Workspace Admin Console for proper delegation setup
3. Verify all service account credentials are correct
4. Contact your Google Workspace administrator if needed

---

**Last Updated**: $(date)  
**Status**: Domain-wide delegation required for `internetbusinesssolutionsindia.com`
