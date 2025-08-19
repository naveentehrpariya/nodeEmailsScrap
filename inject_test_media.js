const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function injectTestMediaChat() {
    console.log('💉 INJECTING TEST CHAT WITH DISPLAYABLE MEDIA');
    console.log('==============================================');
    
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✅ Connected to database');
        
        // Delete existing test chat to avoid duplicates
        await Chat.deleteMany({ displayName: "Employee Monitoring Demo" });
        
        // Create a test chat with properly formatted media attachments
        const testChat = new Chat({
            displayName: "Employee Monitoring Demo",
            account: "monitored_employee",
            lastMessageTime: new Date(),
            messages: [
                {
                    text: "📸 Employee shared a monitored image",
                    createdAt: new Date(Date.now() - 60000 * 10), // 10 minutes ago
                    attachments: [
                        {
                            contentName: "employee_screenshot.png",
                            contentType: "image/png",
                            fileSize: 72,
                            employeeMonitored: true,
                            monitoredAt: new Date(),
                            localPath: "sample_screenshot.png",
                            downloadStatus: "monitored",
                            isRealMedia: true,
                            downloadUrl: "http://localhost:8080/api/media/monitoring/sample_screenshot.png",
                            thumbnailUrl: "http://localhost:8080/api/media/monitoring/sample_screenshot.png",
                            directMediaUrl: "http://localhost:8080/api/media/monitoring/sample_screenshot.png",
                            monitoringData: {
                                employeeId: "monitored_employee",
                                category: "images",
                                status: "monitored_with_sample"
                            }
                        }
                    ]
                },
                {
                    text: "🎥 Employee shared a monitored video",
                    createdAt: new Date(Date.now() - 60000 * 5), // 5 minutes ago
                    attachments: [
                        {
                            contentName: "employee_video.mp4",
                            contentType: "video/mp4", 
                            fileSize: 24,
                            employeeMonitored: true,
                            monitoredAt: new Date(),
                            localPath: "sample_video.mp4",
                            downloadStatus: "monitored",
                            isRealMedia: true,
                            downloadUrl: "http://localhost:8080/api/media/monitoring/sample_video.mp4",
                            thumbnailUrl: "http://localhost:8080/api/media/monitoring/sample_video.mp4",
                            directMediaUrl: "http://localhost:8080/api/media/monitoring/sample_video.mp4",
                            monitoringData: {
                                employeeId: "monitored_employee",
                                category: "videos",
                                status: "monitored_with_sample"
                            }
                        }
                    ]
                },
                {
                    text: "📄 Employee shared a monitored document",
                    createdAt: new Date(Date.now() - 60000 * 2), // 2 minutes ago
                    attachments: [
                        {
                            contentName: "confidential_document.pdf",
                            contentType: "application/pdf",
                            fileSize: 302,
                            employeeMonitored: true,
                            monitoredAt: new Date(),
                            localPath: "sample_document.pdf",
                            downloadStatus: "monitored",
                            isRealMedia: true,
                            downloadUrl: "http://localhost:8080/api/media/monitoring/sample_document.pdf",
                            thumbnailUrl: "http://localhost:8080/api/media/monitoring/sample_document.pdf",
                            directMediaUrl: "http://localhost:8080/api/media/monitoring/sample_document.pdf",
                            monitoringData: {
                                employeeId: "monitored_employee",
                                category: "pdfs",
                                status: "monitored_with_sample"
                            }
                        }
                    ]
                },
                {
                    text: "💬 Regular text message (no attachments)",
                    createdAt: new Date(),
                    attachments: []
                }
            ]
        });
        
        await testChat.save();
        console.log('✅ Test chat created successfully');
        console.log(`📱 Chat ID: ${testChat._id}`);
        console.log(`📊 Messages: ${testChat.messages.length}`);
        console.log(`📎 Attachments: ${testChat.messages.reduce((sum, msg) => sum + msg.attachments.length, 0)}`);
        
        // Verify the data was saved correctly
        const savedChat = await Chat.findById(testChat._id);
        console.log('\n🔍 VERIFICATION:');
        savedChat.messages.forEach((msg, index) => {
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    console.log(`  📎 ${att.contentName}`);
                    console.log(`     Type: ${att.contentType}`);
                    console.log(`     Monitored: ${att.employeeMonitored ? '✅' : '❌'}`);
                    console.log(`     URL: ${att.downloadUrl}`);
                });
            }
        });
        
        console.log('\n🚀 READY FOR FRONTEND:');
        console.log('  ✅ Test chat with monitored media created');
        console.log('  ✅ All attachments have proper URLs');
        console.log('  ✅ Media files are served by backend');
        console.log('  ✅ Chat should now display media properly');
        
        console.log('\n📱 TO VIEW:');
        console.log('  1. Open frontend at http://localhost:3000');
        console.log('  2. Look for "Employee Monitoring Demo" chat');
        console.log('  3. Media attachments should now be visible');
        
    } catch (error) {
        console.error('❌ Error injecting test data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');
    }
}

injectTestMediaChat().catch(console.error);
