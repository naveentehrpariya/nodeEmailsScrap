#!/usr/bin/env node

const mongoose = require('mongoose');
const chatSyncService = require('./services/chatSyncService');
require('dotenv').config();

async function testMediaDownload() {
    try {
        console.log('🧪 Testing PROVEN media download integration...');
        console.log('⏰ Starting at:', new Date().toISOString());
        
        // Connect to database
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✅ Connected to MongoDB');
        
        // Run chat sync which will now use the proven media download methods
        console.log('\n🚀 Running chat sync with enhanced media downloads...');
        const results = await chatSyncService.syncAllAccountChats();
        
        console.log('\n📊 SYNC RESULTS:');
        results.forEach(result => {
            if (result.success) {
                console.log(`✅ ${result.email}: ${result.syncedChats} chats, ${result.syncedMessages} messages`);
            } else {
                console.log(`❌ ${result.email}: ${result.error}`);
            }
        });
        
        // Check media directory for downloads
        const fs = require('fs');
        const path = require('path');
        const mediaDir = path.join(__dirname, 'media');
        
        if (fs.existsSync(mediaDir)) {
            const files = fs.readdirSync(mediaDir).filter(f => !f.startsWith('.'));
            console.log(`\n📁 Media files found: ${files.length}`);
            
            let totalSize = 0;
            files.forEach(file => {
                try {
                    const filePath = path.join(mediaDir, file);
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                    console.log(`   📄 ${file} (${Math.round(stats.size / 1024)}KB)`);
                } catch (error) {
                    console.log(`   ⚠️ ${file} (error reading size)`);
                }
            });
            
            console.log(`📊 Total media size: ${Math.round(totalSize / 1024)}KB`);
        } else {
            console.log('📁 No media directory found');
        }
        
        console.log('\n🎉 Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from database');
    }
}

// Run the test
testMediaDownload().catch(console.error);
