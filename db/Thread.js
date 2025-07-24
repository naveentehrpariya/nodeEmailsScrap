const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   date: { 
      type:String,
   },
   from: {  
      type:String,
   },
   to: {
      type:String,
   },
   account: { type: mongoose.Schema.Types.ObjectId, ref: 'accounts' },
   createdAt: {
      type: Date,
      default: Date.now()     
   },
   deletedAt: {
      type: Date,
      default: null   
   },
});


const Thread = mongoose.model('threads', schema);
module.exports = Thread;
