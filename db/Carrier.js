const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter carrier name.'],
        trim: true
    },
    
    // Legacy email fields for backward compatibility
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    secondary_email: {
        type: String,
        trim: true,
        lowercase: true
    },
    
    // New emails array field for multiple email support
    emails: [{
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        is_primary: {
            type: Boolean,
            default: false
        },
        created_at: {
            type: Date,
            default: Date.now
        }
    }],
    
    phone: {
        type: String,
        trim: true
    },
    secondary_phone: {
        type: String,
        trim: true
    },
    
    // MC (Motor Carrier) Code - unique identifier for carriers
    mc_code: {
        type: String,
        unique: true,
        required: [true, 'MC Code is required.'],
        trim: true
    },
    
    // Generated carrier ID
    carrierID: {
        type: String,
        unique: true,
        required: true
    },
    
    // Location information
    location: {
        type: String,
        trim: true
    },
    country: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    zipcode: {
        type: String,
        trim: true
    },
    
    // Reference to user who created this carrier
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    
    // Reference to company if applicable
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'companies'
    },
    
    // Status flags
    is_active: {
        type: Boolean,
        default: true
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    deletedAt: {
        type: Date
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { updatedAt: 'updatedAt' }
});

// Indexes for better query performance
carrierSchema.index({ mc_code: 1 });
carrierSchema.index({ carrierID: 1 });
carrierSchema.index({ email: 1 });
carrierSchema.index({ 'emails.email': 1 });
carrierSchema.index({ created_by: 1 });
carrierSchema.index({ deletedAt: 1 });

// Virtual for full address
carrierSchema.virtual('full_address').get(function() {
    const addressParts = [this.location, this.city, this.state, this.zipcode, this.country].filter(Boolean);
    return addressParts.join(', ');
});

// Pre-save middleware to ensure at least one primary email
carrierSchema.pre('save', function(next) {
    if (this.emails && this.emails.length > 0) {
        const hasPrimary = this.emails.some(emailObj => emailObj.is_primary);
        if (!hasPrimary) {
            this.emails[0].is_primary = true;
        }
        
        // Ensure only one primary email
        let primaryFound = false;
        this.emails.forEach(emailObj => {
            if (emailObj.is_primary) {
                if (primaryFound) {
                    emailObj.is_primary = false;
                } else {
                    primaryFound = true;
                }
            }
        });
    }
    next();
});

// Instance method to get primary email
carrierSchema.methods.getPrimaryEmail = function() {
    if (this.emails && this.emails.length > 0) {
        const primaryEmail = this.emails.find(emailObj => emailObj.is_primary);
        return primaryEmail ? primaryEmail.email : this.emails[0].email;
    }
    return this.email || null;
};

// Instance method to get all email addresses as array of strings
carrierSchema.methods.getAllEmailAddresses = function() {
    const emailAddresses = [];
    
    if (this.emails && this.emails.length > 0) {
        return this.emails.map(emailObj => emailObj.email);
    }
    
    // Fallback to legacy fields
    if (this.email) emailAddresses.push(this.email);
    if (this.secondary_email) emailAddresses.push(this.secondary_email);
    
    return emailAddresses;
};

// Static method to find by email (checks both legacy and new email fields)
carrierSchema.statics.findByEmail = function(email) {
    return this.findOne({
        $or: [
            { email: email },
            { secondary_email: email },
            { 'emails.email': email }
        ],
        deletedAt: { $exists: false }
    });
};

const Carrier = mongoose.model('carriers', carrierSchema);
module.exports = Carrier;
