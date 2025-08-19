#!/usr/bin/env node

const mongoose = require('mongoose');
const { google } = require('googleapis');
const Account = require('./db/Account');
const Chat = require('./db/Chat');
const keys = require('./dispatch.json');

async function debugChatSync() {
    console.log('🔍 Debug: Manual Google Chat message sync test...');
    
    try {
        // Connect to database
        await mongoose.connect('mongodb://127.0.0.1:27017/emailscrap', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        // Get account
        const account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        if (!account) {
            throw new Error('Account not found');
        }
        
        console.log(`📧 Testing with account: ${account.email} (${account._id})`);
        
        // Setup Google Chat API
        const SCOPES = [
            "https://www.googleapis.com/auth/chat.spaces.readonly",
            "https://www.googleapis.com/auth/chat.messages.readonly",
            "https://www.googleapis.com/auth/admin.directory.user.readonly",
            "https://www.googleapis.com/auth/drive.readonly"
        ];

        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            keys.private_key,
            SCOPES,
            account.email
        );

        const chat = google.chat({ version: "v1", auth });
        
        // Get first space
        const spaceRes = await chat.spaces.list();
        const spaces = spaceRes.data.spaces || [];
        
        if (spaces.length === 0) {
            throw new Error('No spaces found');
        }
        
        const testSpace = spaces[0];
        console.log(`🔍 Testing space: ${testSpace.displayName} (${testSpace.name})`);
        
        // Get messages from space
        const messageRes = await chat.spaces.messages.list({
            parent: testSpace.name,
            pageSize: 5,
        });

        const messages = messageRes.data.messages || [];
        console.log(`📨 Found ${messages.length} messages in space`);
        
        if (messages.length === 0) {
            console.log('⚠️ No messages to test with');
            return;
        }
        
        // Test processing first message
        const testMessage = messages[0];
        console.log('\n🧪 Testing message processing:');
        console.log(`  Message ID: ${testMessage.name}`);
        console.log(`  Text: "${testMessage.text || '(no text)'}"`);
        console.log(`  Sender: ${testMessage.sender?.name || 'Unknown'}`);
        console.log(`  Create Time: ${testMessage.createTime}`);
        console.log(`  Attachments: ${testMessage.attachments ? testMessage.attachments.length : 0}`);
        
        // Try to get full message details
        console.log('\n🔍 Getting full message details...');
        let fullMessage;
        try {
            fullMessage = await chat.spaces.messages.get({
                name: testMessage.name
            });
            console.log(`✅ Got full message data`);
            console.log(`  Full attachments: ${fullMessage.data.attachments ? fullMessage.data.attachments.length : 0}`);
        } catch (error) {
            console.error(`❌ Failed to get full message: ${error.message}`);
            fullMessage = { data: testMessage };
        }
        
        // Try to find existing chat in database
        const existingChat = await Chat.findOne({ 
            spaceId: testSpace.name, 
            account: account._id 
        });
        
        console.log(`\n💾 Database check:`);
        console.log(`  Existing chat found: ${!!existingChat}`);
        if (existingChat) {
            console.log(`  Chat messages count: ${existingChat.messages.length}`);
            console.log(`  Chat message count field: ${existingChat.messageCount}`);
            
            // Check if this specific message exists
            const existingMessage = existingChat.messages.find(msg => msg.messageId === testMessage.name);
            console.log(`  This specific message exists: ${!!existingMessage}`);
            
            if (existingMessage) {
                console.log(`    Existing message text: "${existingMessage.text}"`);
                console.log(`    Existing message attachments: ${existingMessage.attachments ? existingMessage.attachments.length : 0}`);
            }
        }
        
        // Test message object creation
        console.log(`\n🔨 Testing message object creation:`);
        
        const messageObj = {
            messageId: testMessage.name,
            text: testMessage.text || "(no text)",
            senderId: testMessage.sender?.name || "Unknown",
            senderEmail: "test@crossmilescarrier.com", // placeholder
            senderDisplayName: "Test Sender", // placeholder
            senderDomain: "crossmilescarrier.com",
            attachments: [],
            isSentByCurrentUser: false,
            isExternal: false,
            createTime: new Date(testMessage.createTime),
            align: 'left',
            bubbleClass: 'received',
            senderInitials: 'TS',
            formattedTime: new Date(testMessage.createTime).toLocaleTimeString(),
            hasAttachments: false,
            hasMedia: false,
            hasDocuments: false
        };
        
        console.log(`  Created message object:`, {
            messageId: messageObj.messageId,
            text: messageObj.text,
            senderId: messageObj.senderId,
            createTime: messageObj.createTime
        });
        
        // Test saving to database
        console.log(`\n💾 Testing database save:`);
        
        try {
            if (existingChat) {
                console.log(`  Adding to existing chat...`);
                // Check if message already exists
                const exists = existingChat.messages.some(msg => msg.messageId === messageObj.messageId);
                if (!exists) {
                    existingChat.messages.push(messageObj);
                    existingChat.messageCount = existingChat.messages.length;
                    existingChat.lastMessageTime = messageObj.createTime;
                    await existingChat.save();
                    console.log(`  ✅ Message added to existing chat`);
                } else {
                    console.log(`  ⚠️ Message already exists in chat`);
                }
            } else {
                console.log(`  Creating new chat...`);
                const newChat = new Chat({
                    account: account._id,
                    spaceId: testSpace.name,
                    displayName: testSpace.displayName || '(Unnamed)',
                    spaceType: testSpace.spaceType,
                    participants: [],
                    messages: [messageObj],
                    messageCount: 1,
                    lastMessageTime: messageObj.createTime
                });
                
                await newChat.save();
                console.log(`  ✅ New chat created with message`);
            }
        } catch (saveError) {
            console.error(`  ❌ Failed to save: ${saveError.message}`);
            console.error(`  Error details:`, saveError);
        }
        
        console.log('\n🎉 Debug test completed!');
        
    } catch (error) {
        console.error('❌ Debug test failed:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

debugChatSync();
