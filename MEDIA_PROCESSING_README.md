# 📱 Enhanced Chat Message System with Media Processing

## 🎯 Overview

This implementation provides a comprehensive media processing system for chat messages with:
- ✅ **Automatic media download** and processing during chat sync
- ✅ **Smart file classification** (images, videos, audio, documents)
- ✅ **Thumbnail generation** for images and videos
- ✅ **Clickable URLs** in message text
- ✅ **Fallback handling** for unprocessed attachments
- ✅ **Secure file serving** through API endpoints

## 🏗️ Architecture

### Backend Components

#### 1. Media Processing Service (`services/mediaProcessingService.js`)
- **File Classification**: Automatically classifies files by MIME type and extension
- **Download Management**: Downloads files under 50MB from Google Drive and Chat API
- **Thumbnail Generation**: Creates thumbnails for images and videos using Sharp and FFmpeg
- **Metadata Extraction**: Extracts dimensions, duration, file size, etc.
- **Storage Management**: Organizes files in structured directory system

#### 2. Enhanced Chat Sync Service (`services/chatSyncService.js`)
- **Integrated Processing**: Processes attachments during chat sync
- **User Resolution**: Enhanced user ID to display name mapping
- **Message Enhancement**: Adds alignment, styling, and formatting properties
- **Error Handling**: Graceful handling of media processing failures

#### 3. API Routes (`routes/`)
- **`/api/media/*`**: Media file serving, thumbnails, and statistics
- **`/api/chat/*`**: Chat operations, sync management, and analytics
- **`/api/user-mappings/*`**: User mapping CRUD and statistics

### Frontend Components

#### 1. Enhanced ChatMessage Component (`components/ChatMessage.jsx`)
- **URL Detection**: Automatic detection and linking of URLs in messages
- **Media Display**: Inline display of images, videos, and audio
- **File Attachments**: Smart handling of documents with view/download options
- **Fallback Handling**: Shows unprocessed attachments with helpful status messages
- **Responsive Design**: Adapts to different screen sizes and themes

## 📂 File Structure

```
backend/
├── media/                    # Media storage directory
│   ├── thumbnails/          # Generated thumbnails
│   └── [timestamp_filename] # Downloaded media files
├── services/
│   ├── mediaProcessingService.js     # Core media processing
│   ├── chatSyncService.js           # Enhanced chat sync
│   └── chatSyncScheduler.js         # Automatic sync scheduling
├── routes/
│   ├── media.js                     # Media API endpoints
│   ├── chat.js                      # Chat API endpoints
│   └── userMappings.js             # User mapping endpoints
└── db/
    ├── Chat.js                      # Chat message schema
    └── UserMapping.js               # User ID mapping schema

frontend/
├── src/components/
│   ├── ChatMessage.jsx             # Enhanced message component
│   └── ChatMessageDemo.jsx         # Demo/test component
└── ...
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd backend
npm install ffprobe ffprobe-static fluent-ffmpeg sharp axios
```

### 2. Initialize Media Service

```bash
# Start the server
npm start

# Initialize media directories
curl -X POST http://localhost:8080/api/media/initialize
```

### 3. Sync Chats with Media Processing

```bash
# Sync all accounts (processes attachments automatically)
curl -X POST http://localhost:8080/api/chat/sync/all

# Or sync a specific account
curl -X POST http://localhost:8080/api/chat/sync/account/[ACCOUNT_ID]
```

## 📊 Media Types Supported

### Images
- **Formats**: JPEG, PNG, GIF, WebP, BMP
- **Processing**: Automatic thumbnail generation (300x300px)
- **Display**: Inline with click-to-expand
- **Features**: Dimension detection, file size optimization

### Videos
- **Formats**: MP4, WebM, AVI, MOV, WMV
- **Processing**: Thumbnail extraction from first frame
- **Display**: Inline player with poster image
- **Features**: Duration detection, resolution info

### Audio
- **Formats**: MP3, WAV, OGG, M4A, AAC
- **Processing**: Duration and metadata extraction
- **Display**: Inline audio player
- **Features**: Duration display, file size info

### Documents
- **Formats**: PDF, Word, Excel, PowerPoint, Text files
- **Processing**: File type detection and categorization
- **Display**: File info with download/view options
- **Features**: Smart icons based on file type

### Archives
- **Formats**: ZIP, RAR, 7Z
- **Processing**: Size and type detection
- **Display**: Archive icon with download option
- **Features**: Size warnings for large files

## 🔧 API Endpoints

### Media Management
```bash
GET    /api/media/files/:filename        # Serve media files
GET    /api/media/thumbnails/:filename   # Serve thumbnails  
GET    /api/media/statistics             # Storage statistics
POST   /api/media/initialize             # Initialize directories
GET    /api/media/info/:filename         # File information
```

### Chat Management
```bash
GET    /api/chat/account/:accountId      # Get account chats
GET    /api/chat/:chatId/messages        # Get chat messages
POST   /api/chat/sync/all               # Sync all accounts
POST   /api/chat/sync/account/:id       # Sync specific account
GET    /api/chat/search?q=term          # Search chats
GET    /api/chat/analytics              # Chat analytics
```

### User Mappings
```bash
GET    /api/user-mappings/              # List user mappings
GET    /api/user-mappings/stats/overview # Mapping statistics
POST   /api/user-mappings/merge         # Merge duplicate users
```

## 💡 Usage Examples

### 1. Display Chat Messages with Media

```jsx
import ChatMessage from './components/ChatMessage';

function ChatView({ messages }) {
    return (
        <div className="chat-container">
            {messages.map(message => (
                <ChatMessage
                    key={message.id}
                    message={message}
                    showAvatar={true}
                    showName={true}
                    groupMessage={true}
                />
            ))}
        </div>
    );
}
```

### 2. Check Media Processing Status

```bash
# Get media statistics
curl http://localhost:8080/api/media/statistics

# Get chat sync status
curl http://localhost:8080/api/chat/sync/stats
```

### 3. Manual Media Processing

```javascript
// Process specific message attachments
const mediaProcessingService = require('./services/mediaProcessingService');

async function processMessageMedia(message, auth) {
    const processedAttachments = await mediaProcessingService
        .processMessageAttachments(message, auth);
    return processedAttachments;
}
```

## 🎨 Frontend Features

### URL Detection
Messages automatically detect and make URLs clickable:
```
"Check out https://example.com and www.google.com" 
// Both URLs become clickable links
```

### Media Display
- **Images**: Displayed inline with hover effects
- **Videos**: Inline player with thumbnail preview  
- **Audio**: Audio player with duration info
- **Documents**: File info with view/download buttons

### Fallback Handling
Unprocessed attachments show helpful status:
- 📥 "Not processed yet - trigger sync to download"
- ❌ "Download failed"
- ⏭️ "File too large"
- ⏳ "Processing..."

## 🔧 Configuration

### File Size Limits
```javascript
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const THUMBNAIL_SIZE = 300; // 300px
const THUMBNAIL_QUALITY = 80; // 80% JPEG quality
```

### Supported MIME Types
```javascript
const SUPPORTED_TYPES = {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    videos: ['video/mp4', 'video/webm', 'video/avi', 'video/mov'],
    audio: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    documents: ['application/pdf', 'application/msword', 'text/plain']
};
```

## 🐛 Troubleshooting

### Common Issues

1. **Media files not displaying**
   - Check if chat sync has been run
   - Verify media service is initialized
   - Check file download status in database

2. **Thumbnails not generating**
   - Ensure Sharp and FFmpeg are installed
   - Check file permissions on media directory
   - Verify file is under size limit

3. **URLs not clickable**
   - Check message text format
   - Verify ChatMessage component is updated
   - Test with simple URL patterns first

### Debug Commands
```bash
# Check media directory
ls -la backend/media/

# Test media API
curl http://localhost:8080/api/media/statistics

# Check server logs
tail -f server.log

# Test individual attachment
node -e "
const service = require('./services/mediaProcessingService');
service.getMediaStatistics().then(console.log);
"
```

## 📈 Performance Considerations

- **File Size Limits**: Files over 50MB are skipped to prevent memory issues
- **Thumbnail Caching**: Thumbnails are cached with appropriate headers
- **Streaming**: Large files are streamed rather than loaded into memory
- **Error Handling**: Graceful degradation when processing fails
- **Concurrent Processing**: Multiple attachments processed efficiently

## 🔒 Security Features

- **File Validation**: MIME type and extension verification
- **Path Sanitization**: Prevents directory traversal attacks  
- **Size Limits**: Prevents storage exhaustion
- **Error Isolation**: Processing failures don't break chat sync
- **Content Headers**: Proper MIME types for secure serving

## 🎯 Future Enhancements

- [ ] Real-time processing notifications
- [ ] Advanced video processing (transcoding)
- [ ] OCR for document images
- [ ] Media compression options
- [ ] Cloud storage integration
- [ ] Batch processing improvements
- [ ] Advanced search in media content

---

## 📞 Support

For issues or questions about the media processing system:

1. Check the troubleshooting section above
2. Review server logs for error details
3. Test with the demo component (`ChatMessageDemo.jsx`)
4. Verify API endpoints are responding correctly

The system is designed to be robust and handle various edge cases gracefully. Most issues can be resolved by ensuring proper initialization and running a fresh chat sync.
