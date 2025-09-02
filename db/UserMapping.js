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
        enum: [
            'admin_directory', 
            'admin_directory_api',
            'admin_directory_enhanced', 
            'admin_directory_alt',
            'chat_members', 
            'email_direct', 
            'fallback', 
            'manual', 
            'sync_account', 
            'sync_account_fallback',
            'smart_fallback',
            'fast_sync_fallback',
            'original_service_fallback'
        ],
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

userMappingSchema.statics.getUserInfo = async function(userKey) {
    // Support multiple key formats: 'users/123', '123', email
    const candidates = new Set();
    if (typeof userKey === 'string') {
        candidates.add(userKey);
        // Extract numeric ID from 'users/123...'
        if (userKey.includes('/')) {
            const numeric = userKey.split('/').pop();
            if (numeric) candidates.add(numeric);
        }
        // If it's purely numeric, add 'users/<id>' variant
        if (/^\d+$/.test(userKey)) {
            candidates.add(`users/${userKey}`);
        }
    }

    const candidateArray = Array.from(candidates);

    // Initial fetch: anything matching any candidate by userId or email
    let docs = await this.find({
        $or: [
            { userId: { $in: candidateArray } },
            { email: { $in: candidateArray } }
        ]
    }).sort({ confidence: -1, lastSeen: -1 }).lean();

    if (!docs || docs.length === 0) {
        return null;
    }

    // If we found docs with emails, include any mappings whose userId equals those emails
    const relatedEmails = Array.from(new Set(docs.filter(d => !!d.email).map(d => d.email)));
    if (relatedEmails.length > 0) {
        const emailUserIdDocs = await this.find({
            $or: [
                { userId: { $in: relatedEmails } },
                { email: { $in: relatedEmails } }
            ]
        }).sort({ confidence: -1, lastSeen: -1 }).lean();
        // Merge docs (dedupe by _id)
        const seen = new Set(docs.map(d => String(d._id)));
        for (const d of emailUserIdDocs) {
            const id = String(d._id);
            if (!seen.has(id)) {
                docs.push(d);
                seen.add(id);
            }
        }
    }

    // Choose the best doc by confidence, then by resolvedBy priority, then by recency
    const resolvedByPriority = {
        'admin_directory_api': 9,
        'admin_directory_enhanced': 8,
        'admin_directory_alt': 7,
        'admin_directory': 6,
        'sync_account': 5,
        'email_direct': 4,
        'manual': 3,
        'chat_members': 2,
        'sync_account_fallback': 1,
        'smart_fallback': 0,
        'fast_sync_fallback': 0,
        'original_service_fallback': 0,
        'fallback': 0
    };

    docs.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        const prA = resolvedByPriority[a.resolvedBy] ?? 0;
        const prB = resolvedByPriority[b.resolvedBy] ?? 0;
        if (prB !== prA) return prB - prA;
        return new Date(b.lastSeen) - new Date(a.lastSeen);
    });

    const best = docs[0];
    return {
        displayName: best.displayName,
        email: best.email,
        domain: best.domain,
        confidence: best.confidence,
        resolvedBy: best.resolvedBy
    };
};

// Method to get all users from a specific domain
userMappingSchema.statics.getUsersByDomain = async function(domain) {
    return await this.find({ domain }).sort({ displayName: 1 });
};

const UserMapping = mongoose.model('UserMapping', userMappingSchema);

module.exports = UserMapping;
