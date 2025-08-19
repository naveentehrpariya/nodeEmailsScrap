const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
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

const Account = mongoose.model('accounts', schema);
module.exports = Account;
