const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   name: { type:String },
   mime: { type:String },
   size: { type:String },
   filename: { type:String },
   url: { type:String },
   account: { type: mongoose.Schema.Types.ObjectId, ref: 'accounts' },
   email: { type: mongoose.Schema.Types.ObjectId, ref: 'emails' },
   createdAt: {
      type: Date,
      default: Date.now()     
   },
   deletedAt: {
      type: Date,
      default: null   
   },
});
const Attachment = mongoose.model('attachments', schema);
module.exports = Attachment;
