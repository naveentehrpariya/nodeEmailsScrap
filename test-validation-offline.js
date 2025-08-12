#!/usr/bin/env node

const mongoose = require('mongoose');

// Import model schemas without connecting to database
const EmailSchema = require('./db/Email').schema || new mongoose.Schema({
   messageId: { type: String, unique: true, sparse: true },
   gmailMessageId: { type: String, required: true },
   subject: { type: String },
   threadId: { type: String, required: true },
   from: { type: String, required: true },
   to: { type: String, required: false, default: '' },
   date: { type: String },
   body: { type: String },
   textBlocks: { type: [String], default: [] },
   attachments: { type: mongoose.Schema.Types.Mixed, default: [] },
   labelType: { type: String, enum: ['INBOX', 'SENT'], default: 'INBOX' },
   thread: { type: mongoose.Schema.Types.ObjectId, ref: 'threads', required: true },
   createdAt: { type: Date, default: Date.now },
   deletedAt: { type: Date, default: null }
});

function testSchemaValidation() {
    console.log('🧪 Testing email validation offline...\n');
    
    // Test cases that were failing
    const testCases = [
        {
            name: 'Email without TO field (the failing case)',
            data: {
                gmailMessageId: 'test_gmail_123',
                threadId: 'thread_456', 
                subject: 'Test Email Subject',
                from: 'dispatch@crossmilescarrier.com',
                // to: undefined (missing)
                date: new Date().toISOString(),
                body: '<p>Email content</p>',
                textBlocks: ['Email content'],
                attachments: [],
                labelType: 'SENT',
                thread: new mongoose.Types.ObjectId()
            }
        },
        {
            name: 'Email with empty TO field',
            data: {
                gmailMessageId: 'test_gmail_124',
                threadId: 'thread_457',
                subject: 'Test Email Subject', 
                from: 'dispatch@crossmilescarrier.com',
                to: '', // empty string
                date: new Date().toISOString(),
                body: '<p>Email content</p>',
                textBlocks: ['Email content'],
                attachments: [],
                labelType: 'SENT',
                thread: new mongoose.Types.ObjectId()
            }
        },
        {
            name: 'Email with valid TO field',
            data: {
                gmailMessageId: 'test_gmail_125',
                threadId: 'thread_458',
                subject: 'Test Email Subject',
                from: 'dispatch@crossmilescarrier.com', 
                to: 'recipient@example.com',
                date: new Date().toISOString(),
                body: '<p>Email content</p>',
                textBlocks: ['Email content'],
                attachments: [],
                labelType: 'INBOX',
                thread: new mongoose.Types.ObjectId()
            }
        }
    ];
    
    testCases.forEach((testCase, index) => {
        console.log(`${index + 1}. Testing: ${testCase.name}`);
        
        try {
            // Create model instance without saving
            const EmailModel = mongoose.model(`TestEmail${index}`, EmailSchema.clone());
            const email = new EmailModel(testCase.data);
            
            // Run validation
            const validationError = email.validateSync();
            
            if (validationError) {
                console.log('  ❌ Validation failed:');
                Object.keys(validationError.errors).forEach(field => {
                    console.log(`    - ${field}: ${validationError.errors[field].message}`);
                });
            } else {
                console.log('  ✅ Validation passed');
                console.log(`    - to field value: "${email.to}" (type: ${typeof email.to})`);
            }
            
        } catch (error) {
            console.log('  ❌ Error during test:', error.message);
        }
        
        console.log('');
    });
}

// Test the specific header extraction logic
function testHeaderExtraction() {
    console.log('📧 Testing header extraction logic...\n');
    
    // Simulate Gmail API response headers
    const testHeaders = [
        { name: 'From', value: 'dispatch@crossmilescarrier.com' },
        { name: 'Subject', value: 'Important Email' },
        { name: 'Date', value: 'Mon, 11 Aug 2025 19:25:36 +0000' },
        { name: 'Message-ID', value: '<test@example.com>' }
        // Note: No 'To' header
    ];
    
    // Header extraction function from EmailSyncService
    function getHeader(headers, name) {
        return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    }
    
    const subject = getHeader(testHeaders, "Subject") || "(No Subject)";
    const from = getHeader(testHeaders, "From") || "unknown@example.com";
    const to = getHeader(testHeaders, "To") || getHeader(testHeaders, "Cc") || getHeader(testHeaders, "Bcc") || "";
    const date = getHeader(testHeaders, "Date") || new Date().toISOString();
    const messageId = getHeader(testHeaders, "Message-ID") || "unknown";
    
    console.log('Extracted headers:');
    console.log(`  Subject: "${subject}"`);
    console.log(`  From: "${from}"`);
    console.log(`  To: "${to}" (length: ${to.length})`);
    console.log(`  Date: "${date}"`);
    console.log(`  Message-ID: "${messageId}"`);
    
    console.log('\n✅ Header extraction completed\n');
}

// Main execution
console.log('🔍 Email Validation Debug Tool\n');
testHeaderExtraction();
testSchemaValidation();

console.log('🎉 Offline validation testing completed!');
console.log('\n💡 Key findings:');
console.log('- The "to" field is now optional (required: false, default: "")');
console.log('- Empty string values should be accepted');
console.log('- Missing "to" headers will use fallback logic (To -> Cc -> Bcc -> "")');
