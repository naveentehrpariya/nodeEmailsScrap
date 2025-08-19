const mongoose = require('mongoose');
const schema = new mongoose.Schema({
   messageId: {
      type: String,
      unique: false,
      sparse: true,
      index: true
   },
   gmailMessageId: {
      type: String,
      required: true
   },
   subject: { 
      type: String,
   },
   threadId: {
      type: String,
      required: true
   },
   from: {  
      type: String,
      required: true
   },
   to: {
      type: String,
      required: false,
      default: ''
   },
   date: {
      type: String,
   },
   body: {
      type: String,
   },
   textBlocks: {
      type: [String],
      default: []
   },
   attachments: {
      type: mongoose.Schema.Types.Mixed,
      default: []
   },
   labelType: {
      type: String,
      enum: ['INBOX', 'SENT'],
      default: 'INBOX'
   },
   thread: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'threads',
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

// Create compound index for better performance
schema.index({ threadId: 1, labelType: 1 });
schema.index({ thread: 1 }); // Index on thread ObjectId for faster lookup
schema.index({ gmailMessageId: 1 });
schema.index({ messageId: 1 });

// Additional indexes for search functionality
schema.index({ from: 1 }); // Index for sender search
schema.index({ to: 1 }); // Index for recipient search
schema.index({ subject: 1 }); // Index for subject search
schema.index({ thread: 1, labelType: 1, deletedAt: 1 }); // Compound index for optimized queries
schema.index({ labelType: 1, deletedAt: 1, createdAt: -1 }); // Index for filtered sorting

const Emails = mongoose.model('emails', schema);
module.exports = Emails;
