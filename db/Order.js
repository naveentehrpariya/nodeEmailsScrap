const { default: mongoose } = require('mongoose');
const mongo = require('mongoose'); 
const schema = new mongo.Schema({
    // customer_order_no:  {
    //     type:String,
    //     minlength: 1,
    //     required:[true, 'Please enter customer order number.'],
    // }, 
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
    company_name:{ 
        type:String,
        required:true,
    },
    serial_no:  {
        type: String,
        minlength: 1,
        unique:true,
        min: 0,
    },
    
    shipping_details : [],
    
    // Customer
    customer: { 
        type: mongoose.Schema.Types.ObjectId, ref: 'customers',
        required:[true, 'Please enter customer details.'],
    },
   
    total_amount: {
        type:Number,
        required:[true, 'Please enter total amount of this order.'],
    },
    lock : {
        type: Boolean,
        default: false
    },
    
    // CUSTOMER PAYEMENTS
    customer_payment_status : {
        type: String,
        default: 'pending'
    },
    customer_payment_approved_by_admin : {
        type: Number,
        default: 0 // 0 not approved, 1 approved, 2 rejected
    },
    customer_payment_date :{
        type: Date
    },
    customer_payment_method :{
        type: String,
    },
    customer_payment_updated_by :{
        type: mongoose.Schema.Types.ObjectId, ref: 'users',
    },


    // CARRIER PAYMENTS
    carrier_payment_status : {
        type: String,
        default: 'pending'
    },
    carrier_payment_approved_by_admin : {
        type: Number,
        default: 0 // 0 not approved, 1 approved, 2 rejected
    },
    carrier_payment_date :{
        type: Date
    },
    carrier_payment_method :{
        type: String
    },
    carrier_payment_updated_by :{
        type: mongoose.Schema.Types.ObjectId, ref: 'users',
    },

    // Carrier
    carrier: { 
        type: mongoose.Schema.Types.ObjectId, ref: 'carriers',
        required:[true, 'Please enter carrier details.'],
    }, 
    carrier_amount:  {
        type:Number,
        required:[true, 'Please enter selling amount of this order.'],
    },
    
    
    totalDistance : { 
        type: Number,
        // required:[true, 'Please enter total distance of this order.'],
    },
    totalDistanceInKM : { 
        type: Number,
        // required:[true, 'Please enter total distance of this order.'],
    },

    revenue_items: [],
    carrier_revenue_items: [],
    revenue_currency:{
       type: String,
       default:"cad",
    },
    order_status :{
        type: String,
        default:"added",
    },

    // Notes
    notes : {
        type: String,
    },
    carrier_payment_notes : { 
        type: String
    },
    customer_payment_notes : { 
        type: String
    },
    
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    createdAt: {
        type: Date,
        default: Date.now()   
    },
    deletedAt: {
        type: Date,
    },
    updatedAt: {
        type: Date,
    },
},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
}); 

// schema.pre(/^find/, function (next) {
//     this.find({ deletedAt: { $exists: false } });
//     next();
// });

schema.query.notDeleted = function () {
  return this.where({ deletedAt: { $exists: false } });
};


// schema.virtual('gross_amount').get(function () {
//     const items = this.revenue_items || [];
//     let grossAmount = 0;
//     items.forEach(item => {
//         grossAmount += Number(item.value);
//     });
//     return grossAmount;
// });

schema.virtual('commission').get(function () {
    const totalAmount = this.total_amount || 0;
    const staffCommissionRate = this.created_by?.staff_commision || 0;
    return totalAmount * (staffCommissionRate / 100);
});

schema.virtual('customer_final_payment_status').get(function () {
    return this.customer_payment_status
});

schema.virtual('carrier_final_payment_status').get(function () {
    return this.carrier_payment_status
});

schema.virtual('profit').get(function () {
    const totalAmount = this.total_amount || 0;
    const carrierAmount = this.carrier_amount || 0;
    const staffCommissionRate = this.created_by?.staff_commision || 0;
    const commission = totalAmount * (staffCommissionRate / 100);
    const profit = totalAmount - commission - carrierAmount;
    return profit;
});


module.exports = mongo.model('orders', schema);

 