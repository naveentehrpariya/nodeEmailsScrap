const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
   name: { 
      type:String,
      required:[true, 'Commodity name can not be empty.']
    },   
    createdAt: {
      type: Date,
      default: Date.now()     
   },
});
const Commudity = mongoose.model('commudity', schema);
module.exports = Commudity;

 