#!/usr/bin/env node

const mongoose = require('mongoose');
const Email = require('./db/Email');
const Thread = require('./db/Thread');
const Account = require('./db/Account');

// Connect to MongoDB
async function connectDB() {
    try {
        const dbUri = process.env.DATABASE_URI || 'mongodb://localhost:27017/emailsync';
        await mongoose.connect(dbUri);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

// Validate email data structure
function validateEmailData(emailData) {
    const issues = [];
    
    // Check required fields
    if (!emailData.gmailMessageId) {
        issues.push('Missing gmailMessageId');
    }
    if (!emailData.threadId) {
        issues.push('Missing threadId');
    }
    if (!emailData.from) {
        issues.push('Missing from field');
    }
    if (!emailData.thread) {
        issues.push('Missing thread ObjectId reference');
    }
    
    // Check data types
    if (emailData.textBlocks && !Array.isArray(emailData.textBlocks)) {
        issues.push('textBlocks should be an array');
    }
    if (emailData.attachments && !Array.isArray(emailData.attachments)) {
        issues.push('attachments should be an array');
    }
    
    // Check enum values
    if (emailData.labelType && !['INBOX', 'SENT'].includes(emailData.labelType)) {
        issues.push(`Invalid labelType: ${emailData.labelType}`);
    }
    
    return issues;
}

// Test email creation with sample data
async function testEmailValidation() {
    console.log('🧪 Testing email validation...\n');
    
    // Sample email data scenarios
    const testCases = [
        {
            name: 'Valid email with all fields',
            data: {
                gmailMessageId: 'test123',
                threadId: 'thread123',
                subject: 'Test Subject',
                from: 'sender@example.com',
                to: 'recipient@example.com',
                date: new Date().toISOString(),
                body: '<p>Test body</p>',
                textBlocks: ['Test content'],
                attachments: [],
                labelType: 'INBOX',
                thread: new mongoose.Types.ObjectId()
            }
        },
        {
            name: 'Email without TO field (should be valid now)',
            data: {
                gmailMessageId: 'test124',
                threadId: 'thread124',
                subject: 'Test Subject',
                from: 'sender@example.com',
                // to: missing intentionally
                date: new Date().toISOString(),
                body: '<p>Test body</p>',
                textBlocks: ['Test content'],
                attachments: [],
                labelType: 'SENT',
                thread: new mongoose.Types.ObjectId()
            }
        },
        {
            name: 'Email with empty TO field',
            data: {
                gmailMessageId: 'test125',
                threadId: 'thread125',
                subject: 'Test Subject',
                from: 'sender@example.com',
                to: '',
                date: new Date().toISOString(),
                body: '<p>Test body</p>',
                textBlocks: ['Test content'],
                attachments: [],
                labelType: 'INBOX',
                thread: new mongoose.Types.ObjectId()
            }
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`📝 Testing: ${testCase.name}`);
        
        // Validate data structure
        const structuralIssues = validateEmailData(testCase.data);
        if (structuralIssues.length > 0) {
            console.log(`  ⚠️  Structural issues: ${structuralIssues.join(', ')}`);
        } else {
            console.log('  ✅ Structural validation passed');
        }
        
        // Test Mongoose validation
        try {
            const email = new Email(testCase.data);
            await email.validate();
            console.log('  ✅ Mongoose validation passed');
            
            // Don't actually save during test
            // await email.save();
            // console.log('  ✅ Successfully saved to database');
            
        } catch (validationError) {
            console.log('  ❌ Mongoose validation failed:', validationError.message);
            
            // Show specific field errors
            if (validationError.errors) {
                Object.keys(validationError.errors).forEach(field => {
                    console.log(`    - ${field}: ${validationError.errors[field].message}`);
                });
            }
        }
        
        console.log('');
    }
}

// Test thread creation
async function testThreadValidation() {
    console.log('🧵 Testing thread validation...\n');
    
    const threadData = {
        threadId: 'test_thread_123',
        subject: 'Test Thread Subject',
        from: 'sender@example.com',
        to: '', // Empty to field
        account: new mongoose.Types.ObjectId(),
        date: new Date().toISOString()
    };
    
    try {
        const thread = new Thread(threadData);
        await thread.validate();
        console.log('✅ Thread validation passed');
    } catch (validationError) {
        console.log('❌ Thread validation failed:', validationError.message);
        
        if (validationError.errors) {
            Object.keys(validationError.errors).forEach(field => {
                console.log(`  - ${field}: ${validationError.errors[field].message}`);
            });
        }
    }
}

// Main execution
async function main() {
    try {
        await connectDB();
        await testEmailValidation();
        await testThreadValidation();
        
        console.log('🎉 Validation testing completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        mongoose.disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { validateEmailData, testEmailValidation, testThreadValidation };
