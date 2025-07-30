const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const schema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter your name.'],
    },
    email: {
        type: String,
        required: [true, 'Please enter your email address.'],
        lowercase: true,
        validate: [validator.isEmail, 'Please provide a valid email address.'],
        unique: true,
        index: true 
    },
    role: {
        type: Number,
        default:1,
    },
    password: {
        type: String,
        required: [true, 'Please enter your password.'],
        select: false
    },
    createdAt: {
        type: Date,
        default: Date.now()
    },
    deletedAt: {
        type: Date
    },

},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

schema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    this.confirmPassword = undefined;
});

schema.pre(/^find/, function (next) {
    this.find({ active: { $ne: false } });
    next();
});

schema.methods.checkPassword = async function (pass, hash) {
    return await bcrypt.compare(pass, hash);
}

schema.methods.createPasswordResetToken = async function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetTokenExpire = Date.now() + 10 * 60 * 1000;
    return token;
}

const User = mongoose.model('users', schema);
module.exports = User;
