const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
    name: {
        type: String,
        required: [true, 'Please enter Carrier Name.'],
    },
    mc_code: {
        type: String,
        required: [true, 'Please enter MC code.'],
    },
    phone: {
        type: String,
        required: [true, 'Please enter carrier contact number.'],
    },
    email: {
        type: String,
        unique: true,
        required: [true, 'Please enter carrier email address.'],
    },
    secondary_phone: {
        type: String,
    },
    secondary_email: {
        type: String,
    },
    country: {
        type: String,
        required: [true, 'Please enter carrier country.'],
    },
    state: {
        type: String,
        required: [true, 'Please enter carrier state.'],
    },
    city: {
        type: String,
        required: [true, 'Please enter carrier city.'],
    },
    zipcode: {
        type: String,
        required: [true, 'Please enter carrier zipcode.'],
    },
    location: {
        type: String,
        required: [true, 'Please enter carrier location.'],
    },
    carrierID: {
        type: String,
        unique: true
    },
    createdAt: {
       type: Date,
       default: Date.now()
   },
   deletedAt: {type: Date},
   created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Carrier = mongoose.model('carriers', schema);
module.exports = Carrier;
