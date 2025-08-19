const mongoose = require('mongoose');
require('dotenv').config();

const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

// Sample real Google URLs from your data
const realGoogleUrls = {
    image: {
        downloadUrl: 'https://chat.google.com/api/get_attachment_url?url_type=DOWNLOAD_URL&content_type=image/png&attachment_token=AOo0EEWQKtUiRSQeHFXTr2TLWZVMAetAXVKdRdyCZP0YRFRNYgPJO9WVnXfFFvz5r/4gDGNLbgNZM%2BFPio0InS0b13wYhNLkYaOWvwLCFWFG39R8Uxz702YvdhzDxTL93SaUzQXULiVMzjnKmjQy5gysIlhHhZ8X7LtGbXryDvHNXnSAqCQtcIVW4C9fKjHVuQNVeAcmiJhdvnFurucREblQjfe6E63YMerz%2BGJ%2Bku946FnnWcEiStN1%2B8yYAq7reXhcgdM5SnAHfZXKQgLddtJL3ppCjnrCcYw5osVHiBhzxCatHhsB8A4IHP5koorkenfXHwgxv6pwgoJiL3fORw8jYXS/SGhfeFoiqMCkrPmfuFoR5ifBy0iKLSAQCtGoQaOHrbtpjGm2Ysv%2BcQv6s42KYunA5Y6w/xObG1vMbc7Oq1zla%2BTt91VTufnQEivYU8DqEqTYpJtmvoM8xJAX/Ilfpa08mtu%2Bq1IRzrNuoW%2BGl3vGemdXNsHe3vbOs3wx50p78jQ/ECAckJaoZyu4Epb9N9THJCUxwg4jmmxNo0REW6dtm60xxfrjKGegA92eCqG08wPrR7HS9tK0EfdO1TrF7W1pGslHmIyQyvOS/KRa0toDX4A%3D&auto=true',
        thumbnailUrl: 'https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=image/png&attachment_token=AOo0EEWQKtUiRSQeHFXTr2TLWZVMAetAXVKdRdyCZP0YRFRNYgPJO9WVnXfFFvz5r/4gDGNLbgNZM%2BFPio0InS0b13wYhNLkYaOWvwLCFWFG39R8Uxz702YvdhzDxTL93SaUzQXULiVMzjnKmjQy5gysIlhHhZ8X7LtGbXryDvHNXnSAqCQtcIVW4C9fKjHVuQNVeAcmiJhdvnFurucREblQjfe6E63YMerz%2BGJ%2Bku946FnnWcEiStN1%2B8yYAq7reXhcgdM5SnAHfZXKQgLddtJL3ppCjnrCcYw5osVHiBhzxCatHhsB8A4IHP5koorkenfXHwgxv6pwgoJiL3fORw8jYXS/SGhfeFoiqMCkrPmfuFoR5ifBy0iKLSAQCtGoQaOHrbtpjGm2Ysv%2BcQv6s42KYunA5Y6w/xObG1vMbc7Oq1zla%2BTt91VTufnQEivYU8DqEqTYpJtmvoM8xJAX/Ilfpa08mtu%2Bq1IRzrNuoW%2BGl3vGemdXNsHe3vbOs3wx50p78jQ/ECAckJaoZyu4Epb9N9THJCUxwg4jmmxNo0REW6dtm60xxfrjKGegA92eCqG08wPrR7HS9tK0EfdO1TrF7W1pGslHmIyQyvOS/KRa0toDX4A%3D&sz=w512'
    },
    video: {
        downloadUrl: 'https://chat.google.com/api/get_attachment_url?url_type=DOWNLOAD_URL&content_type=video/mp4&attachment_token=AOo0EEWW%2BWcKXobSuuKwQsW1a13NSlwcv/6duBRr7au4nmZFohJM9P%2Bimca%2BEHdpUUZ08%2Bma8Pc6NK2rUWlg9ZK5RInqVECmZV7WnHKrl32SyPGoYxk%2B9jdvTJDZ8XvgEcMq8OkMoX69i154ckJl/on1gQznLGqmhfDkD9RAUIvZpiSGAC/XtUfT%2Bfm/04JXhnis3oDOyypiaDmrLUr6%2BdbVUD/N8T7M5rPDyh%2B6Z3Och1PrGWfYfGlaDqYei7BAJRfiCgQQECF42/%2ByLZDScTME1vTbAxQ1QuxDuA0KNo2Lpg2%2BUb2SK7Am/mNyMBYupctzmiVOqQzy%2B6OKICXtWyxJ2DRVp/PPl7rvRxkJM5y0/aul/7ox49O8ILREBhZbyGpwJ8NPWpTOBQVkGjpXp0fLa3O2YkBQrJcvi/7fxnfPw64LRzaJBz4JpJD5Uv5fw5xNW8BK4zIU%2BTnCj1z4gVYLrH1zt1u/L%2BQ8mKP3Odc0Er8cflVbaiTftjfpE4OtQjUNtB4Gr54EBzg4Yj8U%2BvCkkZYh1OLoAymXhhwePfW2n9eYXYE5hC5bpESIiM7gtNfb/JZnzWONV%2B3TEewNxYL1GLseWoLN0Zfud0rPMWyu9ebeSGQIVJ00fBkmGjxpoINJVvX/nLAiasUyYik1C/x0U98JXF6v7ZhE2cE9yM1z54ZtqBacdBPyqBs5rizKwnyswY0vE0clC04Ms2j67HusBjGU1U8LZASYm4jN/08S&auto=true',
        thumbnailUrl: 'https://chat.google.com/api/get_attachment_url?url_type=FIFE_URL&content_type=video/mp4&attachment_token=AOo0EEWW%2BWcKXobSuuKwQsW1a13NSlwcv/6duBRr7au4nmZFohJM9P%2Bimca%2BEHdpUUZ08%2Bma8Pc6NK2rUWlg9ZK5RInqVECmZV7WnHKrl32SyPGoYxk%2B9jdvTJDZ8XvgEcMq8OkMoX69i154ckJl/on1gQznLGqmhfDkD9RAUIvZpiSGAC/XtUfT%2Bfm/04JXhnis3oDOyypiaDmrLUr6%2BdbVUD/N8T7M5rPDyh%2B6Z3Och1PrGWfYfGlaDqYei7BAJRfiCgQQECF42/%2ByLZDScTME1vTbAxQ1QuxDuA0KNo2Lpg2%2BUb2SK7Am/mNyMBYupctzmiVOqQzy%2B6OKICXtWyxJ2DRVp/PPl7rvRxkJM5y0/aul/7ox49O8ILREBhZbyGpwJ8NPWpTOBQVkGjpXp0fLa3O2YkBQrJcvi/7fxnfPw64LRzaJBz4JpJD5Uv5fw5xNW8BK4zIU%2BTnCj1z4gVYLrH1zt1u/L%2BQ8mKP3Odc0Er8cflVbaiTftjfpE4OtQjUNtB4Gr54EBzg4Yj8U%2BvCkkZYh1OLoAymXhhwePfW2n9eYXYE5hC5bpESIiM7gtNfb/JZnzWONV%2B3TEewNxYL1GLseWoLN0Zfud0rPMWyu9ebeSGQIVJ00fBkmGjxpoINJVvX/nLAiasUyYik1C/x0U98JXF6v7ZhE2cE9yM1z54ZtqBacdBPyqBs5rizKwnyswY0vE0clC04Ms2j67HusBjGU1U8LZASYm4jN/08S&sz=w512'
    },
    pdf: {
        downloadUrl: 'https://chat.google.com/api/get_attachment_url?url_type=DOWNLOAD_URL&content_type=application/pdf&attachment_token=AOo0EEXA5vXc/qvtdwXJrJOx3OxmznMfukaEcRJ2fMuBYiGs1X19GIZhTxYPNH/QLxaIQc%2BzamYg1vcZuNQZiz83KuoO0Ge3YCkEwAwwc4mxJ/9U1jhwIH%2BHBoUs4fbF2Rud%2B3tyRUE/e4e%2BeLbfSrAeSP1ksXHgji7WnytqOuDjyUskxP1vgoVpH0aAr4w3OZvNg/mkyrHDV76fDgp59tf96A27WtuT9nhVpUEx8OPff1Ag16b/6hbY93ZiQ5YzvvIPdDooQw42zYSR05CeouEtNqvQWYp%2B8nnFxYZ5cbw0Y2L4ml5/bHUDvV2zsYTymJqeiFUsFYPNR6leUaNk7m8gT4eNLsJ6Lso0fH6B78TwTXPuYzCVCspf/oZB7zoLHcti9DeEexfk761sxbmiZcDabomvrqwi0qk5yiquT/4wxYAQHMjPD0VZoVURa0U5xt7dlmm7B/hjY671/2/gKnBeGFLhDSTAopv2e2dUTUaBCVq3koJRQNy0p0tzqrDMldQhlErT3OHuUcegBRwxz9v2el5sj6qDm%2BQpyBaZOVhDdwvF1PL%2BPjkdpE6c%2BQJZApLul/M%3D&auto=true',
        thumbnailUrl: 'https://chat.google.com/api/get_attachment_url?url_type=THUMBNAIL_URL&content_type=application/pdf&attachment_token=AOo0EEXA5vXc/qvtdwXJrJOx3OxmznMfukaEcRJ2fMuBYiGs1X19GIZhTxYPNH/QLxaIQc%2BzamYg1vcZuNQZiz83KuoO0Ge3YCkEwAwwc4mxJ/9U1jhwIH%2BHBoUs4fbF2Rud%2B3tyRUE/e4e%2BeLbfSrAeSP1ksXHgji7WnytqOuDjyUskxP1vgoVpH0aAr4w3OZvNg/mkyrHDV76fDgp59tf96A27WtuT9nhVpUEx8OPff1Ag16b/6hbY93ZiQ5YzvvIPdDooQw42zYSR05CeouEtNqvQWYp%2B8nnFxYZ5cbw0Y2L4ml5/bHUDvV2zsYTymJqeiFUsFYPNR6leUaNk7m8gT4eNLsJ6Lso0fH6B78TwTXPuYzCVCspf/oZB7zoLHcti9DeEexfk761sxbmiZcDabomvrqwi0qk5yiquT/4wxYAQHMjPD0VZoVURa0U5xt7dlmm7B/hjY671/2/gKnBeGFLhDSTAopv2e2dUTUaBCVq3koJRQNy0p0tzqrDMldQhlErT3OHuUcegBRwxz9v2el5sj6qDm%2BQpyBaZOVhDdwvF1PL%2BPjkdpE6c%2BQJZApLul/M%3D&sz=w512'
    }
};

async function quickFixRealMedia() {
    console.log('⚡ QUICK FIX: ADDING REAL GOOGLE URLS TO EXISTING CHATS');
    console.log('======================================================');
    
    try {
        await mongoose.connect(process.env.DB_URL_OFFICE);
        console.log('✅ Connected to database');
        
        // Delete test chats first
        await Chat.deleteMany({ 
            $or: [
                { displayName: "Employee Monitoring Demo" },
                { displayName: "Real Media Test" }
            ]
        });
        
        // Create a chat with REAL Google URLs from your data
        const realMediaChat = new Chat({
            displayName: "🎯 REAL Google Chat Media",
            account: "real_media_demo",
            lastMessageTime: new Date(),
            messages: [
                {
                    text: "📸 REAL Google Chat Image (Screenshot 2025-07-24)",
                    createdAt: new Date(Date.now() - 60000 * 10),
                    attachments: [
                        {
                            contentName: "Screenshot 2025-07-24 at 10.08.17 PM.png",
                            contentType: "image/png",
                            
                            // REAL Google URLs from your data
                            downloadUri: realGoogleUrls.image.downloadUrl,
                            thumbnailUri: realGoogleUrls.image.thumbnailUrl,
                            downloadUrl: realGoogleUrls.image.downloadUrl,
                            thumbnailUrl: realGoogleUrls.image.thumbnailUrl,
                            
                            // Display optimization
                            displayUrl: realGoogleUrls.image.thumbnailUrl,
                            primaryMediaUrl: realGoogleUrls.image.downloadUrl,
                            
                            // Metadata
                            fileSize: 'Real Google File',
                            realGoogleMedia: true,
                            optimizedAt: new Date()
                        }
                    ]
                },
                {
                    text: "🎥 REAL Google Chat Video (Video_20250812)",
                    createdAt: new Date(Date.now() - 60000 * 5),
                    attachments: [
                        {
                            contentName: "Video_20250812_221149_497.mp4",
                            contentType: "video/mp4",
                            
                            // REAL Google URLs from your data
                            downloadUri: realGoogleUrls.video.downloadUrl,
                            thumbnailUri: realGoogleUrls.video.thumbnailUrl,
                            downloadUrl: realGoogleUrls.video.downloadUrl,
                            thumbnailUrl: realGoogleUrls.video.thumbnailUrl,
                            
                            // Display optimization
                            displayUrl: realGoogleUrls.video.thumbnailUrl,
                            primaryMediaUrl: realGoogleUrls.video.downloadUrl,
                            
                            // Metadata
                            fileSize: 'Real Google File',
                            realGoogleMedia: true,
                            optimizedAt: new Date()
                        }
                    ]
                },
                {
                    text: "📄 REAL Google Chat PDF (macbookbill.pdf)",
                    createdAt: new Date(Date.now() - 60000 * 2),
                    attachments: [
                        {
                            contentName: "macbookbill.pdf",
                            contentType: "application/pdf",
                            
                            // REAL Google URLs from your data
                            downloadUri: realGoogleUrls.pdf.downloadUrl,
                            thumbnailUri: realGoogleUrls.pdf.thumbnailUrl,
                            downloadUrl: realGoogleUrls.pdf.downloadUrl,
                            thumbnailUrl: realGoogleUrls.pdf.thumbnailUrl,
                            
                            // Display optimization
                            displayUrl: realGoogleUrls.pdf.thumbnailUrl,
                            primaryMediaUrl: realGoogleUrls.pdf.downloadUrl,
                            
                            // Metadata
                            fileSize: 'Real Google File',
                            realGoogleMedia: true,
                            optimizedAt: new Date()
                        }
                    ]
                },
                {
                    text: "💡 These are ACTUAL Google Chat URLs from your data logs!",
                    createdAt: new Date(),
                    attachments: []
                }
            ]
        });
        
        await realMediaChat.save();
        console.log('✅ Real Google Chat media created successfully!');
        console.log(`📱 Chat ID: ${realMediaChat._id}`);
        console.log('📍 Chat Name: "🎯 REAL Google Chat Media"');
        
        console.log('\n🔗 REAL URLS ADDED:');
        console.log('📸 Image download:', realGoogleUrls.image.downloadUrl.substring(0, 100) + '...');
        console.log('🖼️ Image thumbnail:', realGoogleUrls.image.thumbnailUrl.substring(0, 100) + '...');
        console.log('🎥 Video download:', realGoogleUrls.video.downloadUrl.substring(0, 100) + '...');
        console.log('📄 PDF download:', realGoogleUrls.pdf.downloadUrl.substring(0, 100) + '...');
        
        console.log('\n🎯 READY TO TEST:');
        console.log('==================');
        console.log('✅ Database has chat with REAL Google media URLs');
        console.log('✅ Frontend media utils updated to use real URLs first');
        console.log('✅ Authentication may be required for some media');
        console.log('');
        console.log('📱 TO VIEW:');
        console.log('1. 🌐 Open http://localhost:3000');
        console.log('2. 📱 Look for "🎯 REAL Google Chat Media"');
        console.log('3. 👆 Click to view real Google Chat attachments');
        console.log('4. 🖼️ Images should show (thumbnails work better)');
        console.log('');
        console.log('💡 NOTE: If you see authentication errors, that\'s normal');
        console.log('   The URLs are real but need Google session authentication');
        console.log('   Thumbnails often work better than full downloads');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');
    }
}

quickFixRealMedia().catch(console.error);
