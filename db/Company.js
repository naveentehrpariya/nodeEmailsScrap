const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   // user: { 
   //    type: mongoose.Schema.Types.ObjectId, ref: 'users'
   // },
   company_slug: { 
      type:String,
   },                                                                                                                                                                                                            
   logo: { 
      type:String,
   },
   name: { 
      type:String,
      required:[true, 'Please enter company name.']
   },
   email: { 
      type:String,
      required:[true, 'Please enter company email address.'],
   },
   phone: { 
      type:String,
      required:[true, 'Please enter company contact number.'],
   },
   address: { 
      type:String,
      required:[true, 'Please enter company address.'],
   },
   createdAt: {
       type: Date,
       default: Date.now()
   }
});

const Company = mongoose.model('companies', schema);
module.exports = Company;

 