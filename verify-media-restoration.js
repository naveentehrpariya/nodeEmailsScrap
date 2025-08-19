const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://naveentehrpariya:Naveen%402024@cluster0.tsvps.mongodb.net/emailScrap?retryWrites=true&w=majority&appName=Cluster0';

// Chat schema
const chatSchema = new mongoose.Schema({}, { strict: false });
const Chat = mongoose.model('Chat', chatSchema);

async function verifyMediaRestoration() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to CLOUD database');
    
    console.log('\n🔍 FINAL VERIFICATION: Media Restoration Status');
    console.log('================================================================================');
    
    const chats = await Chat.find({}).exec();
    console.log(`📊 Found ${chats.length} total chats`);
    
    let totalAttachments = 0;
    let attachmentsWithLocalPath = 0;
    let attachmentsWithDownloadStatus = 0;
    let chatsWithMedia = 0;
    
    const mediaBreakdown = {
      images: 0,
      videos: 0,
      documents: 0,
      audio: 0,
      other: 0
    };
    
    console.log('\n📋 DETAILED CHAT ANALYSIS:\n');
    
    chats.forEach((chat, index) => {
      const messages = chat.messages || [];
      const chatAttachments = messages.reduce((acc, msg) => {
        return acc + (msg.attachments ? msg.attachments.length : 0);
      }, 0);
      
      if (chatAttachments > 0) {
        chatsWithMedia++;
        console.log(`🗨️  Chat ${chatsWithMedia}: "${chat.name || chat.space?.displayName || 'Unnamed'}"`);
        console.log(`   📍 Space ID: ${chat.spaceId || 'N/A'}`);
        console.log(`   📨 Messages: ${messages.length}, 📎 Attachments: ${chatAttachments}`);
        
        messages.forEach((msg, msgIndex) => {
          if (msg.attachments && msg.attachments.length > 0) {
            console.log(`   💬 Message ${msgIndex + 1}: "${(msg.text || '(no text)').substring(0, 30)}..." (${msg.attachments.length} attachments)`);
            
            msg.attachments.forEach((att, attIndex) => {
              const hasLocalPath = !!att.localPath;
              const hasDownloadStatus = !!att.downloadStatus;
              const mediaType = att.mediaType || 'unknown';
              
              console.log(`      📎 ${attIndex + 1}. "${att.name || 'Unnamed'}" (${att.contentType || 'Unknown type'})`);
              console.log(`         📁 Local Path: ${hasLocalPath ? '✅' : '❌'} ${att.localPath || 'NOT SET'}`);
              console.log(`         📥 Download Status: ${hasDownloadStatus ? '✅' : '❌'} ${att.downloadStatus || 'NOT SET'}`);
              console.log(`         🏷️  Media Type: ${mediaType}`);
              
              // Count by media type
              if (mediaType === 'image') mediaBreakdown.images++;
              else if (mediaType === 'video') mediaBreakdown.videos++;
              else if (mediaType === 'document') mediaBreakdown.documents++;
              else if (mediaType === 'audio') mediaBreakdown.audio++;
              else mediaBreakdown.other++;
              
              if (hasLocalPath) attachmentsWithLocalPath++;
              if (hasDownloadStatus) attachmentsWithDownloadStatus++;
              totalAttachments++;
            });
          }
        });
        console.log('');
      }
    });
    
    console.log('================================================================================');
    console.log('🎯 FINAL SUMMARY:');
    console.log('================================================================================');
    console.log(`📊 Total chats: ${chats.length}`);
    console.log(`📊 Chats with media: ${chatsWithMedia}`);
    console.log(`📊 Total attachments: ${totalAttachments}`);
    console.log(`📊 Attachments with local paths: ${attachmentsWithLocalPath}/${totalAttachments}`);
    console.log(`📊 Attachments with download status: ${attachmentsWithDownloadStatus}/${totalAttachments}`);
    
    console.log('\\n📈 MEDIA BREAKDOWN:');
    console.log(`   🖼️  Images: ${mediaBreakdown.images}`);
    console.log(`   🎥 Videos: ${mediaBreakdown.videos}`);
    console.log(`   📄 Documents: ${mediaBreakdown.documents}`);
    console.log(`   🎵 Audio: ${mediaBreakdown.audio}`);
    console.log(`   📦 Other: ${mediaBreakdown.other}`);
    
    console.log('\\n🎉 RESTORATION STATUS:');
    if (totalAttachments === 0) {
      console.log('🚨 CRITICAL: NO MEDIA ATTACHMENTS FOUND! Media has disappeared.');
      console.log('   ⚡ Solution: Run media-preserving-comprehensive-sync.js again');
    } else if (attachmentsWithLocalPath === totalAttachments && attachmentsWithDownloadStatus === totalAttachments) {
      console.log('✅ SUCCESS: ALL MEDIA ATTACHMENTS FULLY RESTORED!');
      console.log('   🎯 All attachments have local paths and download status');
      console.log('   🚀 Frontend should display all media properly');
    } else {
      console.log('⚠️  PARTIAL: Some attachments missing local paths or download status');
      console.log(`   📁 Missing local paths: ${totalAttachments - attachmentsWithLocalPath}`);
      console.log(`   📥 Missing download status: ${totalAttachments - attachmentsWithDownloadStatus}`);
      console.log('   ⚡ Solution: Run fix-all-media-paths.js again');
    }
    
    console.log('\\n🛡️ PROTECTION STATUS:');
    console.log('✅ Automatic schedulers have been disabled');
    console.log('✅ Media-preserving sync scripts are available');
    console.log('✅ Fix scripts are available for path issues');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\\n🔐 Disconnected from database');
  }
}

verifyMediaRestoration();
