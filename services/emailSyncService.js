const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const Account = require("../db/Account");
const Thread = require("../db/Thread");
const Email = require("../db/Email");
const keys = require("../dispatch.json");

class EmailSyncService {
    constructor() {
        this.SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
    }

    // Create Gmail client for specific email account
    createGmailClient(email) {
        try {
            // Validate the email domain
            const domain = email.split('@')[1];
            console.log(`🔐 Creating OAuth client for ${email} (domain: ${domain})`);
            
            const auth = new google.auth.JWT(
                keys.client_email,
                null,
                keys.private_key,
                this.SCOPES,
                email
            );
            
            // Enable domain-wide delegation
            auth.subject = email;
            
            return google.gmail({ version: "v1", auth });
        } catch (error) {
            console.error(`❌ Failed to create Gmail client for ${email}:`, error.message);
            throw new Error(`OAuth configuration error for ${email}: ${error.message}`);
        }
    }

    // Helper function to get header value
    getHeader(headers, name) {
        return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    }

    // Helper function to decode base64
    decodeBase64(data) {
        return Buffer.from(data, "base64").toString("utf-8");
    }

    // Extract email body content
    extractEmailBodyStructured(payload) {
        let html = "";
        let plain = "";

        const findPart = (parts) => {
            for (const part of parts) {
                if (part.mimeType === "text/html" && part.body?.data) {
                    html = this.decodeBase64(part.body.data);
                }
                if (part.mimeType === "text/plain" && part.body?.data) {
                    plain = this.decodeBase64(part.body.data);
                }
                if (part.parts) findPart(part.parts);
            }
        };

        if (payload.body?.data) {
            plain = this.decodeBase64(payload.body.data);
        } else if (payload.parts) {
            findPart(payload.parts);
        }

        const structured = {
            rawHtml: html || `<pre>${plain}</pre>`,
            textBlocks: [],
        };

        if (html) {
            const dom = new JSDOM(html);
            const text = dom.window.document.body.textContent || "";
            structured.textBlocks = text
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
        } else {
            structured.textBlocks = plain
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
        }

        return structured;
    }

    // Extract attachments from email
    extractAttachments(payload, attachments = []) {
        if (!payload) return attachments;

        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.filename && part.filename.length > 0) {
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        body: part.body,
                    });
                }
                if (part.parts) {
                    this.extractAttachments(part, attachments);
                }
            }
        }

        return attachments;
    }

    // Download attachment
    async downloadAttachment(gmail, messageId, attachment) {
        if (!attachment.body || !attachment.body.attachmentId) return null;

        try {
            const res = await gmail.users.messages.attachments.get({
                userId: "me",
                messageId: messageId,
                id: attachment.body.attachmentId,
            });

            const data = res.data.data;
            const buffer = Buffer.from(data, "base64");

            // Create a safe file name
            const safeFileName = `${messageId}_${attachment.filename}`;
            const mediaDir = path.join(__dirname, "..", "media");
            const filePath = path.join(mediaDir, safeFileName);

            // Ensure media directory exists
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir, { recursive: true });
            }

            fs.writeFileSync(filePath, buffer);
            console.log(`📥 Saved attachment: ${safeFileName}`);

            return {
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                localPath: filePath,
            };
        } catch (error) {
            console.error(`Failed to download attachment ${attachment.filename}:`, error.message);
            return null;
        }
    }
    // Sync emails for a single account
    async syncAccountEmails(account, labelType = 'INBOX', maxResults = 100) {
        console.log(`🔄 Syncing emails for ${account.email} (${labelType})...`);
        try {
            // Validate domain before attempting sync
            const domain = account.email.split('@')[1];
            const unsupportedDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com'];
            
            if (unsupportedDomains.includes(domain.toLowerCase())) {
                throw new Error(`Domain ${domain} does not support service account delegation. Use OAuth2 flow for personal email accounts.`);
            }
            
            const gmail = this.createGmailClient(account.email);
            
            // Get label ID for SENT emails
            let labelIds = [];
            if (labelType === 'SENT') {
                labelIds = ['SENT'];
            } else {
                labelIds = ['INBOX'];
            }

            // Calculate date filter for last 1 month (30 days)
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
            const dateFilter = oneMonthAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            
            console.log(`📅 Fetching emails after ${dateFilter} for ${account.email} (${labelType})`);

            // Fetch messages with date filter
            const response = await gmail.users.messages.list({
                userId: "me",
                labelIds: labelIds,
                maxResults: maxResults,
                q: `after:${dateFilter}` // Gmail search query to filter emails after the specified date
            });

            const messages = response.data.messages || [];
            console.log(`📧 Found ${messages.length} ${labelType} messages for ${account.email}`);

            const threadsMap = {};
            const processedEmails = [];

            for (const msg of messages) {
                try {
                    const detail = await gmail.users.messages.get({
                        userId: "me",
                        id: msg.id,
                        format: "full",
                    });

                    const threadId = detail.data.threadId;
                    const headers = detail.data.payload.headers;
                    const subject = this.getHeader(headers, "Subject") || "(No Subject)";
                    const from = this.getHeader(headers, "From") || account.email; // Fallback to account email
                    const to = this.getHeader(headers, "To") || this.getHeader(headers, "Cc") || this.getHeader(headers, "Bcc") || "";
                    const date = this.getHeader(headers, "Date") || new Date().toISOString();
                    const messageId = this.getHeader(headers, "Message-ID") || msg.id;

                    // Create or update thread
                    if (!threadsMap[threadId]) {
                        threadsMap[threadId] = {
                            subject,
                            threadId,
                            from,
                            to,
                            date,
                            account: account._id,
                            emails: [],
                        };
                    }

                    // Extract email body
                    const body = this.extractEmailBodyStructured(detail.data.payload);
                    
                    // Extract and download attachments (OPTIMIZED: Skip downloads in production to prevent 502 errors)
                    const rawAttachments = this.extractAttachments(detail.data.payload);
                    const attachments = [];

                    // Only download attachments in development environment
                    if (process.env.NODE_ENV !== 'production') {
                        for (const attachment of rawAttachments) {
                            const downloaded = await this.downloadAttachment(gmail, msg.id, attachment);
                            if (downloaded) attachments.push(downloaded);
                        }
                    } else {
                        // In production, store attachment metadata without downloading
                        for (const attachment of rawAttachments) {
                            attachments.push({
                                filename: attachment.filename,
                                mimeType: attachment.mimeType,
                                attachmentId: attachment.body?.attachmentId || null,
                                size: attachment.body?.size || 0,
                                localPath: null, // Not downloaded in production
                                downloadStatus: 'deferred' // Mark as deferred
                            });
                        }
                        console.log(`📋 Deferred ${rawAttachments.length} attachments in production mode`);
                    }

                    const emailData = {
                        messageId: messageId || msg.id,
                        subject,
                        threadId,
                        from,
                        to,
                        date,
                        body: body.rawHtml,
                        textBlocks: body.textBlocks,
                        attachments,
                        labelType, // 'INBOX' or 'SENT'
                        gmailMessageId: msg.id,
                    };

                    threadsMap[threadId].emails.push(emailData);
                    processedEmails.push(emailData);

                } catch (emailError) {
                    console.error(`Failed to process message ${msg.id}:`, emailError.message);
                }
            }

            // Save to database
            await this.saveEmailsToDatabase(account, Object.values(threadsMap));

            console.log(`✅ Successfully synced ${processedEmails.length} emails for ${account.email} (${labelType})`);
            return processedEmails;

        } catch (error) {
            console.error(`❌ Failed to sync emails for ${account.email}:`, error.message);
            throw error;
        }
    }

    // Save emails to database
    async saveEmailsToDatabase(account, threads) {
        try {
            for (const threadData of threads) {
                // Find or create thread using upsert to avoid duplicate key errors
                let thread;
                try {
                    thread = await Thread.findOneAndUpdate(
                        {
                            threadId: threadData.threadId,
                            account: account._id
                        },
                        {
                            $set: {
                                subject: threadData.subject,
                                from: threadData.from,
                                to: threadData.to,
                                date: threadData.date,
                            },
                            $unset: {
                                deletedAt: 1  // Remove deletedAt if it exists
                            }
                        },
                        {
                            upsert: true,
                            new: true,
                            setDefaultsOnInsert: true
                        }
                    );
                } catch (upsertError) {
                    if (upsertError.code === 11000) {
                        // Handle duplicate key by finding the existing thread
                        console.log(`⚠️ Thread already exists, finding existing: ${threadData.threadId}`);
                        thread = await Thread.findOne({
                            threadId: threadData.threadId,
                            account: account._id
                        });
                    } else {
                        throw upsertError;
                    }
                }

                // Save emails
                for (const emailData of threadData.emails) {
                    try {
                        // Enhanced duplicate check: Check if email already exists with the same messageId and labelType FOR THIS ACCOUNT ONLY
                        // First get all threads for this account to ensure we only check within this account
                        const accountThreadIds = await Thread.find({ account: account._id }).distinct('_id');
                        const existingEmail = await Email.findOne({
                            $or: [
                                { messageId: emailData.messageId },
                                { gmailMessageId: emailData.gmailMessageId }
                            ],
                            thread: { $in: accountThreadIds }, // Scope to this account's threads only
                            labelType: emailData.labelType,
                            deletedAt: { $exists: false }
                        });

                        if (!existingEmail) {
                            // Try to create the email, handle duplicates gracefully
                            await Email.create({
                                ...emailData,
                                thread: thread._id,
                            });
                            console.log(`📧 Saved email: ${emailData.subject || '(No Subject)'} (${emailData.labelType}) - ${new Date(emailData.date).toLocaleDateString()}`);
                        } else {
                            console.log(`⏭️  Skipped duplicate: ${emailData.subject || '(No Subject)'} (${emailData.labelType}) - ${new Date(emailData.date).toLocaleDateString()}`);
                        }
                    } catch (emailError) {
                        // Handle duplicate key errors gracefully
                        if (emailError.code === 11000) {
                            console.log(`⏭️  Duplicate email detected and skipped: ${emailData.subject || '(No Subject)'} (${emailData.labelType}) - ${new Date(emailData.date).toLocaleDateString()}`);
                        } else {
                            console.error(`❌ Failed to save email ${emailData.messageId}:`, emailError.message);
                            throw emailError;
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Failed to save emails to database:", error.message);
            throw error;
        }
    }

    // Sync all accounts with unified threading
    async syncAllAccounts() {
        console.log("🚀 Starting unified email sync for all accounts...");
        
        try {
            const accounts = await Account.find({ deletedAt: { $exists: false } });
            console.log(`📬 Found ${accounts.length} accounts to sync`);

            const results = [];

            for (const account of accounts) {
                try {
                    console.log(`🔄 Processing account: ${account.email}`);
                    
                    // Use unified sync that processes both INBOX and SENT together
                    const syncResult = await this.syncAccountEmailsUnified(account);

                    // Update last sync timestamp
                    await Account.findByIdAndUpdate(account._id, {
                        lastSync: new Date()
                    });

                    results.push({
                        account: account.email,
                        success: true,
                        inboxCount: syncResult.inboxCount,
                        sentCount: syncResult.sentCount,
                        total: syncResult.total // Use already calculated total
                    });

                } catch (accountError) {
                    console.error(`❌ Failed to sync account ${account.email}:`, accountError.message);
                    results.push({
                        account: account.email,
                        success: false,
                        error: accountError.message
                    });
                }
            }

            console.log("\n📊 UNIFIED SYNC SUMMARY:");
            results.forEach(result => {
                if (result.success) {
                    console.log(`✅ ${result.account}: ${result.total} emails unified (${result.inboxCount} inbox, ${result.sentCount} sent)`);
                } else {
                    console.log(`❌ ${result.account}: ${result.error}`);
                }
            });

            const totalProcessed = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.total, 0);
            
            console.log(`\n🏁 Total emails processed across all accounts: ${totalProcessed}`);

            return results;

        } catch (error) {
            console.error("❌ Failed to sync all accounts:", error.message);
            throw error;
        }
    }

    // NEW: Unified email sync that properly groups threads
    async syncAccountEmailsUnified(account, maxResults = 100) {
        console.log(`🔄 Unified sync for ${account.email}...`);
        try {
            // Validate domain before attempting sync
            const domain = account.email.split('@')[1];
            const unsupportedDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com'];
            
            if (unsupportedDomains.includes(domain.toLowerCase())) {
                throw new Error(`Domain ${domain} does not support service account delegation. Use OAuth2 flow for personal email accounts.`);
            }
            
            const gmail = this.createGmailClient(account.email);
            
            // Calculate date filter for last 1 month (30 days)
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
            const dateFilter = oneMonthAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            
            console.log(`📅 Fetching emails after ${dateFilter} for ${account.email} (unified sync)`);
            
            // Fetch BOTH INBOX and SENT emails with date filter
            const [inboxResponse, sentResponse] = await Promise.all([
                gmail.users.messages.list({
                    userId: "me",
                    labelIds: ['INBOX'],
                    maxResults: maxResults,
                    q: `after:${dateFilter}` // Gmail search query to filter emails after the specified date
                }),
                gmail.users.messages.list({
                    userId: "me",
                    labelIds: ['SENT'],
                    maxResults: maxResults,
                    q: `after:${dateFilter}` // Gmail search query to filter emails after the specified date
                })
            ]);

            const inboxMessages = inboxResponse.data.messages || [];
            const sentMessages = sentResponse.data.messages || [];
            console.log(`📧 Found ${inboxMessages.length} INBOX + ${sentMessages.length} SENT messages for ${account.email}`);

            // Combine all messages with their label types
            const allMessages = [
                ...inboxMessages.map(msg => ({ ...msg, labelType: 'INBOX' })),
                ...sentMessages.map(msg => ({ ...msg, labelType: 'SENT' }))
            ];

            const threadsMap = {}; // Group by Gmail threadId
            const processedEmails = [];
            let inboxCount = 0;
            let sentCount = 0;

            for (const msg of allMessages) {
                try {
                    const detail = await gmail.users.messages.get({
                        userId: "me",
                        id: msg.id,
                        format: "full",
                    });

                    const gmailThreadId = detail.data.threadId; // Gmail's thread ID
                    const headers = detail.data.payload.headers;
                    const subject = this.getHeader(headers, "Subject") || "(No Subject)";
                    const from = this.getHeader(headers, "From") || account.email;
                    const to = this.getHeader(headers, "To") || this.getHeader(headers, "Cc") || this.getHeader(headers, "Bcc") || "";
                    const date = this.getHeader(headers, "Date") || new Date().toISOString();
                    const messageId = this.getHeader(headers, "Message-ID") || msg.id;

                    // Group by Gmail threadId (this is the key fix!)
                    if (!threadsMap[gmailThreadId]) {
                        threadsMap[gmailThreadId] = {
                            subject,
                            threadId: gmailThreadId,
                            from,
                            to,
                            date,
                            account: account._id,
                            emails: [],
                        };
                    }

                    // Extract email body
                    const body = this.extractEmailBodyStructured(detail.data.payload);
                    
                    // Extract and download attachments (OPTIMIZED: Skip downloads in production to prevent 502 errors)
                    const rawAttachments = this.extractAttachments(detail.data.payload);
                    const attachments = [];

                    // Only download attachments in development environment
                    if (process.env.NODE_ENV !== 'production') {
                        for (const attachment of rawAttachments) {
                            const downloaded = await this.downloadAttachment(gmail, msg.id, attachment);
                            if (downloaded) attachments.push(downloaded);
                        }
                    } else {
                        // In production, store attachment metadata without downloading
                        for (const attachment of rawAttachments) {
                            attachments.push({
                                filename: attachment.filename,
                                mimeType: attachment.mimeType,
                                attachmentId: attachment.body?.attachmentId || null,
                                size: attachment.body?.size || 0,
                                localPath: null, // Not downloaded in production
                                downloadStatus: 'deferred' // Mark as deferred
                            });
                        }
                        console.log(`📋 Deferred ${rawAttachments.length} attachments in production mode`);
                    }

                    const emailData = {
                        messageId: messageId || msg.id,
                        subject,
                        threadId: gmailThreadId,
                        from,
                        to,
                        date,
                        body: body.rawHtml,
                        textBlocks: body.textBlocks,
                        attachments,
                        labelType: msg.labelType, // INBOX or SENT
                        gmailMessageId: msg.id,
                    };

                    threadsMap[gmailThreadId].emails.push(emailData);
                    processedEmails.push(emailData);

                    // Count by type
                    if (msg.labelType === 'INBOX') {
                        inboxCount++;
                    } else {
                        sentCount++;
                    }

                } catch (emailError) {
                    console.error(`Failed to process message ${msg.id}:`, emailError.message);
                }
            }

            console.log(`🧵 Grouped ${processedEmails.length} emails into ${Object.keys(threadsMap).length} unified threads`);

            // Save to database with unified threading
            await this.saveEmailsToDatabase(account, Object.values(threadsMap));

            console.log(`✅ Successfully synced ${processedEmails.length} emails for ${account.email} (${inboxCount} inbox, ${sentCount} sent)`);
            return { inboxCount, sentCount, total: processedEmails.length };

        } catch (error) {
            console.error(`❌ Failed to sync emails for ${account.email}:`, error.message);
            throw error;
        }
    }

    // Manual sync for specific account
    async syncSingleAccount(accountId) {
        try {
            const account = await Account.findOne({
                _id: accountId,
                deletedAt: { $exists: false }
            });

            if (!account) {
                throw new Error("Account not found");
            }

            console.log(`🔄 Manual sync started for ${account.email}`);

            // Use unified sync method
            const syncResult = await this.syncAccountEmailsUnified(account);

            // Update last sync timestamp
            await Account.findByIdAndUpdate(account._id, {
                lastSync: new Date()
            });

            const result = {
                account: account.email,
                success: true,
                inboxCount: syncResult.inboxCount,
                sentCount: syncResult.sentCount,
                total: syncResult.total,
                syncTime: new Date()
            };

            console.log(`✅ Manual sync completed for ${account.email}: ${result.total} emails processed`);
            return result;

        } catch (error) {
            console.error(`❌ Manual sync failed:`, error.message);
            throw error;
        }
    }
}

module.exports = new EmailSyncService();
