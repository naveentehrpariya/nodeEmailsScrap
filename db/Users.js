const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Company = require('./Company');

const schema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
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
    avatar: {type: String},
    status: {
        type: String,
        default: "active",
        index: true 
    },
    staff_commision: {
        type: Number,
    },
    corporateID: { 
        type: String,
        required: [true, 'Corporate ID can not be empty.'],
        unique: true,
        index: true 
    },
    role: {
        type: Number,
        default:1,
    },
    position : { 
        type: String,
    },
    is_admin: {
        type: Number,
        default:0
    },
    isSuper: {
        type: String,
        default:0
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    password: {
        type: String,
        required: [true, 'Please enter your password.'],
        select: false
    },
    // confirmPassword: {
    //     type: String,
    //     required: true,
    //     required: [true, 'Please re-enter your password.'],
    //     select: false,
    //     validate: {
    //         validator: function (val) { return val === this.password },
    //         message: "Passwords did't matched."
    //     }
    // },
    

    // additonal fields
    phone: {
        type:String,
        required:[true, 'Please enter your phone number.'],
    },
    country: {
        type:String,
        required:[true, 'Please enter your country.'],
    },
    address: {
        type:String,
        required:[true, 'Please enter your address.'],
    },

    createdAt: {
        type: Date,
        default: Date.now()
    },
    changedPasswordAt: Date,
    passwordResetToken: String,
    resetTokenExpire: Date,
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

// schema.virtual('company').get(async function () {
//     const companydetails = await Company.findById(this.company_id);
//     return companydetails;
// });


const User = mongoose.model('users', schema);
module.exports = User;
