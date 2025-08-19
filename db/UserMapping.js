const mongoose = require('mongoose');

const userMappingSchema = new mongoose.Schema({
    // Google user ID (e.g., "users/108506371856200018714" or just "108506371856200018714")
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // User's display name (resolved from various sources)
    displayName: {
        type: String,
        required: true
    },
    
    // User's email address (if known)
    email: {
        type: String,
        default: null,
        index: true
    },
    
    // Domain of the user's email
    domain: {
        type: String,
        default: null,
        index: true
    },
    
    // How this user was resolved
    resolvedBy: {
        type: String,
        enum: ['admin_directory', 'chat_members', 'email_direct', 'fallback', 'manual'],
        default: 'fallback'
    },
    
    // Which account's sync discovered this user (for tracking purposes)
    discoveredByAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    
    // Confidence score of the resolution (higher = more reliable)
    confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    
    // Track when this mapping was first created and last updated
    firstSeen: {
        type: Date,
        default: Date.now
    },
    
    lastSeen: {
        type: Date,
        default: Date.now
    },
    
    // Count how many times we've seen this user across different chats
    seenCount: {
        type: Number,
        default: 1
    },
    
    // Additional metadata
    metadata: {
        // Original raw user resource name from Google
        originalUserResourceName: String,
        // Any additional info we might gather
        additionalInfo: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Indexes for efficient lookups
userMappingSchema.index({ userId: 1 });
userMappingSchema.index({ email: 1 });
userMappingSchema.index({ domain: 1 });
userMappingSchema.index({ discoveredByAccount: 1 });
userMappingSchema.index({ confidence: -1 }); // Higher confidence first

// Static methods for common operations
userMappingSchema.statics.findOrCreateUser = async function(userInfo) {
    const { userId, displayName, email, domain, resolvedBy, discoveredByAccount, confidence = 50, originalUserResourceName } = userInfo;
    
    let user = await this.findOne({ userId });
    
    if (user) {
        // Update existing user if we have better info
        let updated = false;
        
        if (confidence > user.confidence) {
            user.displayName = displayName;
            user.email = email || user.email;
            user.domain = domain || user.domain;
            user.resolvedBy = resolvedBy;
            user.confidence = confidence;
            updated = true;
        }
        
        user.lastSeen = new Date();
        user.seenCount += 1;
        
        if (updated || user.isModified()) {
            await user.save();
        }
        
        return user;
    } else {
        // Create new user mapping
        return await this.create({
            userId,
            displayName,
            email,
            domain,
            resolvedBy,
            discoveredByAccount,
            confidence,
            metadata: {
                originalUserResourceName
            }
        });
    }
};

userMappingSchema.statics.getUserInfo = async function(userId) {
    const user = await this.findOne({ userId });
    
    if (user) {
        return {
            displayName: user.displayName,
            email: user.email,
            domain: user.domain,
            confidence: user.confidence,
            resolvedBy: user.resolvedBy
        };
    }
    
    return null;
};

// Method to get all users from a specific domain
userMappingSchema.statics.getUsersByDomain = async function(domain) {
    return await this.find({ domain }).sort({ displayName: 1 });
};

const UserMapping = mongoose.model('UserMapping', userMappingSchema);

module.exports = UserMapping;
