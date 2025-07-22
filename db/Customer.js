const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
    name: {
        type: String,
        required: [true, 'Please enter customer name.'],
    },
    customerCode: {
        type: String,
    },
    secondary_phone: {
        type: String,
    },
    phone: {
        type: String,
        required: [true, 'Please enter customer contact number.'],
    },
    email: {
        type: String,
        unique: true,
        required: [true, 'Please enter customer email address.'],
    },
    secondary_email: {
        type: String,
    },
    address: {
        type: String,
        required: [true, 'Please enter customer address.'],
    },
    country: {
        type: String,
        required: [true, 'Please enter customer country.'],
    },
    state: {
        type: String,
        required: [true, 'Please enter customer state.'],
    },
    city: {
        type: String,
        required: [true, 'Please enter customer city.'],
    },
    
    zipcode: {
        type: String,
        required: [true, 'Please enter customer zipcode.'],
    },
    createdAt: {
       type: Date,
       default: Date.now()
   },
   deletedAt: {type: Date},
   created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
   assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Customer = mongoose.model('customers', schema);
module.exports = Customer;
