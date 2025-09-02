const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true
    },
    text: {
        type: String,
        default: ''
    },
    senderId: {
        type: String,
        required: true
    },
    // Reference to UserMapping for efficient data fetching
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserMapping',
        default: null // null if user not found in UserMapping
    },
    senderEmail: {
        type: String,
        required: true
    },
    senderDisplayName: {
        type: String,
        required: true
    },
    senderDomain: {
        type: String,
        required: true
    },
    isSentByCurrentUser: {
        type: Boolean,
        default: false
    },
    isExternal: {
        type: Boolean,
        default: false
    },
    attachments: [{
        // Original Google Chat attachment data
        name: String,
        contentType: String,
        contentName: String,
        attachmentDataRef: {
            resourceName: String,
            attachmentUploadResourceName: String
        },
        driveDataRef: {
            driveFileId: String
        },
        
        // Enhanced attachment info
        filename: String,
        fileName: String, // alias for compatibility
        fileSize: Number,
        size: Number, // alias for compatibility
        mimeType: String,
        downloadUrl: String,
        thumbnailUrl: String,
        
        // Media classification
        mediaType: {
            type: String,
            enum: ['image', 'video', 'audio', 'document', 'archive', 'other'],
            default: 'other'
        },
        
        // Media dimensions (for images/videos)
        dimensions: {
            width: Number,
            height: Number
        },
        duration: Number, // for video/audio in seconds
        
        // Download and storage
        localPath: String,
        downloadedAt: Date,
        downloadStatus: {
            type: String,
            enum: ['pending', 'downloading', 'completed', 'failed', 'skipped'],
            default: 'pending'
        },
        downloadError: String,
        
        // Metadata
        sourceId: String, // Unique identifier from source (resourceName, driveFileId, etc.)
        isImage: Boolean,
        isVideo: Boolean,
        isAudio: Boolean,
        isDocument: Boolean,
        
        createdAt: { type: Date, default: Date.now }
    }],
    createTime: {
        type: Date,
        required: true
    }
});

const chatSchema = new mongoose.Schema({
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    spaceId: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    spaceType: {
        type: String,
        enum: ['DIRECT_MESSAGE', 'SPACE', 'GROUP_CHAT'],
        required: true
    },
    participants: [{
        userId: String,
        email: String,
        displayName: String,
        // Reference to UserMapping for efficient data fetching
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'UserMapping',
            default: null
        }
    }],
    messageCount: {
        type: Number,
        default: 0
    },
    messages: [chatMessageSchema],
    lastMessageTime: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
chatSchema.index({ account: 1, lastMessageTime: -1 });
chatSchema.index({ spaceId: 1 });
chatSchema.index({ 'messages.messageId': 1 });

// Compound unique index to ensure one chat per spaceId per account
chatSchema.index({ account: 1, spaceId: 1 }, { unique: true });

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
