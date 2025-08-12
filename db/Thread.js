const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   threadId: {
      type: String,
      required: true,
      index: true
   },
   subject: {
      type: String,
      default: '(No Subject)'
   },
   date: { 
      type: String,
   },
   from: {  
      type: String,
      required: true
   },
   to: {
      type: String,
      default: ''
   },
   account: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'accounts',
      required: true
   },
   createdAt: {
      type: Date,
      default: Date.now()     
   },
   deletedAt: {
      type: Date,
      default: null   
   },
}, {
   toJSON: { virtuals: true },
   toObject: { virtuals: true }
});

// Create indexes for better query performance
schema.index({ threadId: 1, account: 1 }, { unique: true });
schema.index({ account: 1, createdAt: -1 });
schema.index({ deletedAt: 1 });

const Thread = mongoose.model('threads', schema);
module.exports = Thread;
