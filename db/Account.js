const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Please enter email address.'],
    },
    lastSync: {
       type: Date,
    },
    lastChatSync: {
       type: Date,
    },
    createdAt: {
       type: Date,
       default: Date.now()
    },
    deletedAt: {type: Date},
},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Create a partial unique index that only applies to non-deleted accounts
// This allows the same email to be reused after deletion
schema.index(
    { email: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { deletedAt: null },
        name: 'email_unique_active'
    }
);

const Account = mongoose.model('accounts', schema);
module.exports = Account;
