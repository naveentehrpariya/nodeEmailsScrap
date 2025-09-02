#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();
const Email = require('./db/Email');

async function checkEmailAttachments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📧 CHECKING EMAIL ATTACHMENT STRUCTURE');
        console.log('======================================\n');
        
        // Get a few emails and check their structure
        const emails = await Email.find({}).limit(5);
        console.log(`Found ${emails.length} emails:`);
        
        for (const email of emails) {
            console.log(`\nEmail: "${email.subject}"`);
            console.log(`  Has attachments field: ${!!email.attachments}`);
            console.log(`  Attachments type: ${typeof email.attachments}`);
            console.log(`  Attachments length: ${email.attachments?.length || 'N/A'}`);
            
            if (email.attachments && email.attachments.length > 0) {
                console.log(`  Attachments content:`);
                email.attachments.forEach((att, i) => {
                    console.log(`    ${i + 1}. ${att.filename || 'No filename'}`);
                    console.log(`       Type: ${att.mimeType || 'No mimeType'}`);
                    console.log(`       Path: ${att.localPath || 'No localPath'}`);
                });
            } else {
                console.log(`  No attachments in this email`);
            }
        }
        
        // Check the Email model schema
        console.log('\n📋 EMAIL MODEL SCHEMA:');
        const schema = Email.schema;
        if (schema.paths.attachments) {
            console.log('✅ Attachments field exists in schema');
            console.log(`   Type: ${schema.paths.attachments.constructor.name}`);
        } else {
            console.log('❌ Attachments field NOT found in schema');
        }
        
        // Find any emails that might have attachments with different query
        const emailsWithData = await Email.find({
            $or: [
                { attachments: { $exists: true } },
                { 'attachments.0': { $exists: true } }
            ]
        });
        
        console.log(`\n🔍 Emails with any attachments data: ${emailsWithData.length}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkEmailAttachments().catch(console.error);
