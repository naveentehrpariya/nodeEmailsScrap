const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   company: { type: mongoose.Schema.Types.ObjectId, ref: 'companies' },
   name: { 
      type:String,
      required:[true, 'Equipment name can not be empty.']
    },   
    createdAt: {
      type: Date,
      default: Date.now()     
   },
});

const Equipment = mongoose.model('equipment', schema);
module.exports = Equipment;

 