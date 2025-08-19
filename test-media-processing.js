#!/usr/bin/env node

/**
 * Test script for media processing functionality
 * Run this to verify that the media processing system is working correctly
 */

const mediaProcessingService = require('./services/mediaProcessingService');
const path = require('path');
const fs = require('fs').promises;

async function testMediaProcessing() {
    console.log('🧪 Testing Media Processing System...\n');
    
    try {
        // Test 1: Initialize media service
        console.log('1️⃣ Testing media service initialization...');
        await mediaProcessingService.initialize();
        console.log('✅ Media service initialized successfully\n');
        
        // Test 2: Check media statistics
        console.log('2️⃣ Testing media statistics...');
        const stats = await mediaProcessingService.getMediaStatistics();
        console.log('📊 Media Statistics:');
        console.log(`   - Total files: ${stats.totalFiles}`);
        console.log(`   - Total thumbnails: ${stats.totalThumbnails}`);
        console.log(`   - Storage used: ${stats.totalSizeMB} MB`);
        console.log(`   - File types: ${JSON.stringify(stats.fileTypeBreakdown, null, 2)}\n`);
        
        // Test 3: File type classification
        console.log('3️⃣ Testing file type classification...');
        const testFiles = [
            'image.jpg',
            'video.mp4', 
            'audio.mp3',
            'document.pdf',
            'archive.zip',
            'unknown.xyz'
        ];
        
        testFiles.forEach(filename => {
            const type = mediaProcessingService.classifyMediaType(getMimeTypeFromFilename(filename));
            console.log(`   - ${filename}: ${type}`);
        });
        console.log();
        
        // Test 4: Sample attachment processing (mock)
        console.log('4️⃣ Testing attachment processing (mock)...');
        const mockAttachment = {
            name: 'test-image.jpg',
            contentType: 'image/jpeg',
            filename: 'test-image.jpg',
            // This is a mock - real processing would need actual attachment data
        };
        
        const processed = await mockProcessAttachment(mockAttachment);
        console.log('📎 Mock attachment processed:');
        console.log(JSON.stringify(processed, null, 2));
        console.log();
        
        // Test 5: Directory structure
        console.log('5️⃣ Checking directory structure...');
        const mediaDir = path.join(__dirname, 'media');
        const thumbnailDir = path.join(__dirname, 'media/thumbnails');
        
        try {
            await fs.access(mediaDir);
            console.log('✅ Media directory exists');
        } catch {
            console.log('❌ Media directory not found');
        }
        
        try {
            await fs.access(thumbnailDir);
            console.log('✅ Thumbnails directory exists');
        } catch {
            console.log('❌ Thumbnails directory not found');
        }
        console.log();
        
        console.log('🎉 All media processing tests completed!\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Mock attachment processing for testing
async function mockProcessAttachment(attachment) {
    return {
        // Copy original data
        name: attachment.name,
        contentType: attachment.contentType,
        filename: attachment.filename,
        
        // Enhanced fields (mock)
        mimeType: attachment.contentType,
        mediaType: mediaProcessingService.classifyMediaType(attachment.contentType),
        downloadStatus: 'mock',
        
        // Set boolean flags
        isImage: attachment.contentType?.includes('image') || false,
        isVideo: attachment.contentType?.includes('video') || false,
        isAudio: attachment.contentType?.includes('audio') || false,
        isDocument: attachment.contentType?.includes('pdf') || attachment.contentType?.includes('document') || false,
        
        createdAt: new Date(),
        
        // Mock processing results
        fileSize: 1024 * 100, // 100KB
        processed: true
    };
}

// Helper function to get MIME type from filename
function getMimeTypeFromFilename(filename) {
    const extension = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mp3',
        '.wav': 'audio/wav',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

// Test URL detection function
function testUrlDetection() {
    console.log('🔗 Testing URL detection...');
    
    const testTexts = [
        'Check out https://www.google.com',
        'Visit www.github.com for code',
        'Multiple links: https://react.dev and www.nodejs.org', 
        'No links here',
        'Email: test@example.com',
        'Mixed: Call me at (555) 123-4567 or visit https://example.com'
    ];
    
    const urlRegex = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;
    
    testTexts.forEach((text, index) => {
        const matches = text.match(urlRegex);
        console.log(`   Test ${index + 1}: "${text}"`);
        if (matches) {
            console.log(`      Found URLs: ${matches.join(', ')}`);
        } else {
            console.log('      No URLs found');
        }
    });
    console.log();
}

// Run tests
if (require.main === module) {
    testUrlDetection();
    testMediaProcessing().then(() => {
        console.log('✨ Testing completed!');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 Testing failed:', error);
        process.exit(1);
    });
}
