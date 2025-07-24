const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   subject: { 
      type:String,
   },
   threadId: {
      type:String,
   },
   from: {  
      type:String,
   },
   to: {
      type:String,
   },
   body: {
        type: String,
   },
   thread: { type: mongoose.Schema.Types.ObjectId, ref: 'threads' },
   createdAt: {
      type: Date,
      default: Date.now()     
   },
   deletedAt: {
      type: Date,
      default: null   
   },
});


const Emails = mongoose.model('emails', schema);
module.exports = Emails;
