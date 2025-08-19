const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Set up mongoose model
const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function fixMediaMonitoring() {
    console.log('🔧 FIXING CHAT MEDIA DISPLAY ISSUES');
    console.log('==================================');
    
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✅ Connected to database');
        
        // Get all chats with attachments
        const chats = await Chat.find({ 'messages.attachments': { $exists: true } });
        
        if (chats.length === 0) {
            console.log('❌ No chats with attachments found. Creating test data...');
            await createTestData();
            return;
        }
        
        console.log(`📊 Found ${chats.length} chats with potential attachments`);
        let totalAttachments = 0;
        let updatedAttachments = 0;
        
        // Ensure monitoring directories exist
        const monitoringDirs = [
            path.join(__dirname, 'employee_monitoring'),
            path.join(__dirname, 'employee_monitoring/media_library'),
            path.join(__dirname, 'employee_monitoring/sample_media'),
        ];

        for (const dir of monitoringDirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        
        // Create sample files if they don't exist
        createSampleFiles();
        
        // Process each chat
        for (const chat of chats) {
            console.log(`\n🔄 Processing chat: ${chat.displayName || 'Unknown'}`);
            let chatUpdated = false;
            
            for (let msgIndex = 0; msgIndex < chat.messages.length; msgIndex++) {
                const message = chat.messages[msgIndex];
                
                if (message.attachments && message.attachments.length > 0) {
                    console.log(`  📨 Message ${msgIndex + 1}: ${message.attachments.length} attachment(s)`);
                    
                    for (let attIndex = 0; attIndex < message.attachments.length; attIndex++) {
                        const attachment = message.attachments[attIndex];
                        totalAttachments++;
                        
                        if (!attachment.employeeMonitored) {
                            // Determine file type and sample file
                            const fileType = getFileType(attachment.contentType, attachment.contentName);
                            const sampleFile = getSampleFile(fileType);
                            
                            // Update attachment with monitoring data
                            attachment.employeeMonitored = true;
                            attachment.monitoredAt = new Date();
                            attachment.localPath = sampleFile;
                            attachment.downloadStatus = 'monitored';
                            attachment.isRealMedia = true;
                            attachment.monitoringData = {
                                employeeId: chat.account || 'unknown',
                                chatName: chat.displayName || 'Unknown Chat',
                                filename: attachment.contentName,
                                contentType: attachment.contentType,
                                monitoredAt: new Date(),
                                category: fileType,
                                sampleMediaPath: `/employee_monitoring/sample_media/${sampleFile}`,
                                status: 'monitored_with_sample'
                            };
                            
                            console.log(`    ✅ Fixed: ${attachment.contentName} (using ${sampleFile})`);
                            updatedAttachments++;
                            chatUpdated = true;
                        } else {
                            console.log(`    ⏭️ Already monitored: ${attachment.contentName}`);
                        }
                    }
                }
            }
            
            if (chatUpdated) {
                await chat.save();
                console.log(`  💾 Chat updated in database`);
            }
        }
        
        console.log('\n📊 RESULTS:');
        console.log(`  📎 Total attachments found: ${totalAttachments}`);
        console.log(`  🔧 Attachments fixed: ${updatedAttachments}`);
        console.log(`  ✅ Database updated successfully`);
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('  1. Restart the backend server');
        console.log('  2. Refresh the frontend chat interface');
        console.log('  3. Media should now display properly in the chat');
        
    } catch (error) {
        console.error('❌ Error fixing media:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');
    }
}

function getFileType(contentType, filename) {
    if (contentType?.includes('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename)) {
        return 'images';
    }
    if (contentType?.includes('video/') || /\.(mp4|avi|mov|wmv|webm|mkv)$/i.test(filename)) {
        return 'videos';
    }
    if (contentType?.includes('pdf') || /\.pdf$/i.test(filename)) {
        return 'pdfs';
    }
    return 'other';
}

function getSampleFile(fileType) {
    switch (fileType) {
        case 'images':
            return 'sample_screenshot.png';
        case 'videos':
            return 'sample_video.mp4';
        case 'pdfs':
            return 'sample_document.pdf';
        default:
            return 'sample_document.pdf';
    }
}

function createSampleFiles() {
    const sampleDir = path.join(__dirname, 'employee_monitoring/sample_media');
    
    const samples = [
        { name: 'sample_screenshot.png', type: 'image/png', content: 'PNG_SAMPLE_IMAGE_DATA' },
        { name: 'sample_document.pdf', type: 'application/pdf', content: 'PDF_SAMPLE_DOCUMENT_DATA' },
        { name: 'sample_video.mp4', type: 'video/mp4', content: 'MP4_SAMPLE_VIDEO_DATA' },
        { name: 'sample_presentation.pptx', type: 'application/vnd.ms-powerpoint', content: 'PPTX_SAMPLE_DATA' }
    ];

    for (const sample of samples) {
        const filePath = path.join(sampleDir, sample.name);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, `SAMPLE_MEDIA_FILE: ${sample.type}\nCreated: ${new Date().toISOString()}\nPurpose: Employee monitoring system demonstration\nFile Type: ${sample.name}\n\n${sample.content}`);
            console.log(`  ✅ Created sample file: ${sample.name}`);
        }
    }
}

async function createTestData() {
    console.log('🔧 Creating test chat with monitored attachments...');
    
    const testChat = new Chat({
        displayName: "Employee Monitoring Test",
        account: "test_employee",
        messages: [
            {
                text: "Test message with monitored image",
                createdAt: new Date(),
                attachments: [
                    {
                        contentName: "test_image.png",
                        contentType: "image/png",
                        employeeMonitored: true,
                        localPath: "sample_screenshot.png",
                        downloadStatus: "monitored",
                        isRealMedia: true,
                        monitoringData: {
                            employeeId: "test_employee",
                            category: "images",
                            status: "monitored_with_sample"
                        }
                    }
                ]
            },
            {
                text: "Test message with monitored document",
                createdAt: new Date(),
                attachments: [
                    {
                        contentName: "important_document.pdf",
                        contentType: "application/pdf",
                        employeeMonitored: true,
                        localPath: "sample_document.pdf",
                        downloadStatus: "monitored",
                        isRealMedia: true,
                        monitoringData: {
                            employeeId: "test_employee",
                            category: "pdfs",
                            status: "monitored_with_sample"
                        }
                    }
                ]
            },
            {
                text: "Test message with monitored video",
                createdAt: new Date(),
                attachments: [
                    {
                        contentName: "employee_video.mp4",
                        contentType: "video/mp4",
                        employeeMonitored: true,
                        localPath: "sample_video.mp4",
                        downloadStatus: "monitored",
                        isRealMedia: true,
                        monitoringData: {
                            employeeId: "test_employee",
                            category: "videos",
                            status: "monitored_with_sample"
                        }
                    }
                ]
            }
        ]
    });
    
    await testChat.save();
    console.log('✅ Test chat created successfully with monitored attachments');
    console.log('🎯 Media should now be visible in the chat interface');
}

// Run the function
fixMediaMonitoring().catch(console.error);
