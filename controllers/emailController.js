const User = require("../db/Users");
const catchAsync = require("../utils/catchAsync");
const {promisify} = require("util");
const AppError = require("../utils/AppError");
const bcrypt = require('bcrypt');
const Account = require("../db/Account");
const JSONerror = require("../utils/jsonErrorHandler");
const logger = console.log; // Replace with your actual logger
const emailSyncService = require('../services/emailSyncService');
const emailScheduler = require('../services/emailScheduler');

exports.addNewAccount = catchAsync ( async (req, res, next) => { 
   const { email } = req.body;
   console.log("Adding new account for email:", email);
   await Account.syncIndexes();
   Account.create({
      email: email,
      lastSync: new Date(),
   }).then(result => {
      res.status(200).json({
         status: true,
         message: "Email account has been Added.",
         account: result
      });
   }).catch(err => {
      JSONerror(res, err, next);
      logger(err);
   });
});

// Get all accounts
exports.getAllAccounts = catchAsync(async (req, res, next) => {
   try {
      const accounts = await Account.find({ deletedAt: { $exists: false } })
         .sort({ createdAt: -1 })
         .lean();
      
      res.status(200).json({
         status: true,
         message: "Accounts fetched successfully",
         accounts: accounts
      });
   } catch (err) {
      return next(new AppError("Failed to fetch accounts", 500));
   }
});

// Get single account by ID
exports.getAccount = catchAsync(async (req, res, next) => {
   const { id } = req.params;
   
   try {
      const account = await Account.findOne({ 
         _id: id, 
         deletedAt: { $exists: false } 
      }).lean();
      
      if (!account) {
         return next(new AppError("Account not found", 404));
      }
      
      res.status(200).json({
         status: true,
         message: "Account fetched successfully",
         account: account
      });
   } catch (err) {
      return next(new AppError("Failed to fetch account", 500));
   }
});

// Edit/Update account
exports.editAccount = catchAsync(async (req, res, next) => {
   const { id } = req.params;
   const { email } = req.body;
   
   if (!email) {
      return next(new AppError("Email is required", 400));
   }
   
   try {
      // Check if the account exists
      const existingAccount = await Account.findOne({ 
         _id: id, 
         deletedAt: { $exists: false } 
      });
      
      if (!existingAccount) {
         return next(new AppError("Account not found", 404));
      }
      
      // Check if the new email already exists in another account
      const emailExists = await Account.findOne({ 
         email: email,
         _id: { $ne: id },
         deletedAt: { $exists: false }
      });
      
      if (emailExists) {
         return next(new AppError("Email already exists in another account", 400));
      }
      
      // Update the account
      const updatedAccount = await Account.findByIdAndUpdate(
         id,
         { 
            email: email,
            lastSync: existingAccount.lastSync // Keep existing lastSync
         },
         { 
            new: true, // Return updated document
            runValidators: true // Run mongoose validators
         }
      );
      
      res.status(200).json({
         status: true,
         message: "Account updated successfully",
         account: updatedAccount
      });
   } catch (err) {
      if (err.code === 11000) {
         return next(new AppError("Email already exists", 400));
      }
      return next(new AppError("Failed to update account", 500));
   }
});



// Delete account (soft delete)
exports.deleteAccount = catchAsync(async (req, res, next) => {
   const { id } = req.params;
   
   try {
      const account = await Account.findOne({ 
         _id: id, 
         deletedAt: { $exists: false } 
      });
      
      if (!account) {
         return next(new AppError("Account not found", 404));
      }
      
      // Soft delete by setting deletedAt timestamp
      await Account.findByIdAndUpdate(id, {
         deletedAt: new Date()
      });
      
      res.status(200).json({
         status: true,
         message: "Account deleted successfully"
      });
   } catch (err) {
      return next(new AppError("Failed to delete account", 500));
   }
});



function getEmails(email, type ='SENT') {
}

exports.getAllEmails = catchAsync ( async (req, res, next) => { 
   const { email, type } = req.body;
   if(!email){
      return next(new AppError("Email is required !!", 401))
   }
   const user = await Accounts.findOne({ email }).select('+password').lean();
   if (!user) {
      return res.status(200).json({ status: false, message: "Invalid Details" });
   } 
   if(!(await bcrypt.compare(password, user.password))){
    res.status(200).json({
      status : false, 
      message:"Details are invalid.",
     });   
   }

   const token = await signToken(user._id);
  //  res.cookie('jwt', token, {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === 'production', // Use true in production (HTTPS)
  //   sameSite: 'Strict', // or 'Lax' for less strict
  //   maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  // });

  user.password = undefined;
  user.confirmPassword = undefined;
   res.status(200).json({
    status :true,
    message:"Login Successfully !!",
    user : user,
    token
   });
});

// Manual sync for specific account
exports.syncAccount = catchAsync(async (req, res, next) => {
   const { id } = req.params;
   
   try {
      console.log(`🔄 Manual sync requested for account ID: ${id}`);
      
      // If it's an email, find the account ObjectId
      let accountId = id;
      if (id.includes('@')) {
         const account = await Account.findOne({ 
            email: id, 
            deletedAt: { $exists: false } 
         });
         
         if (!account) {
            return next(new AppError("Account not found", 404));
         }
         
         accountId = account._id.toString();
         console.log(`🔍 Resolved email ${id} to account ID: ${accountId}`);
      }
      
      const result = await emailSyncService.syncSingleAccount(accountId);
      
      res.status(200).json({
         status: true,
         message: `Email sync completed for ${result.account}`,
         data: result
      });
   } catch (err) {
      console.error('Manual sync error:', err.message);
      return next(new AppError(err.message || "Failed to sync account", 500));
   }
});

// Manual sync all accounts
exports.syncAllAccounts = catchAsync(async (req, res, next) => {
   try {
      console.log('🔄 Manual sync all accounts requested');
      const results = await emailSyncService.syncAllAccounts();
      
      const successCount = results.filter(r => r.success).length;
      const totalEmails = results.reduce((sum, r) => sum + (r.total || 0), 0);
      
      res.status(200).json({
         status: true,
         message: `Sync completed for ${successCount}/${results.length} accounts`,
         data: {
            results: results,
            summary: {
               totalAccounts: results.length,
               successfulAccounts: successCount,
               failedAccounts: results.length - successCount,
               totalEmailsProcessed: totalEmails
            }
         }
      });
   } catch (err) {
      console.error('Manual sync all error:', err.message);
      return next(new AppError(err.message || "Failed to sync all accounts", 500));
   }
});

// Get scheduler status
exports.getSchedulerStatus = catchAsync(async (req, res, next) => {
   try {
      const status = emailScheduler.getStatus();
      
      res.status(200).json({
         status: true,
         message: "Scheduler status retrieved",
         data: status
      });
   } catch (err) {
      return next(new AppError("Failed to get scheduler status", 500));
   }
});

// Start/Stop scheduler
exports.toggleScheduler = catchAsync(async (req, res, next) => {
   const { action } = req.body; // 'start' or 'stop'
   
   try {
      if (action === 'start') {
         emailScheduler.start();
         res.status(200).json({
            status: true,
            message: "Email scheduler started successfully",
            data: emailScheduler.getStatus()
         });
      } else if (action === 'stop') {
         emailScheduler.stop();
         res.status(200).json({
            status: true,
            message: "Email scheduler stopped successfully",
            data: emailScheduler.getStatus()
         });
      } else {
         return next(new AppError("Invalid action. Use 'start' or 'stop'", 400));
      }
   } catch (err) {
      return next(new AppError(`Failed to ${action} scheduler`, 500));
   }
});

// Get account threads with emails (INBOX/SENT)
exports.getAccountThreads = catchAsync(async (req, res, next) => {
   const { accountId } = req.params;
   const { labelType = 'INBOX', page = 1, limit = 20 } = req.query;
   
   try {
      // Check if accountId is an email or ObjectId
      let accountQuery;
      if (accountId.includes('@')) {
         // It's an email address
         accountQuery = { email: accountId, deletedAt: null };
      } else {
         // It's an ObjectId
         accountQuery = { _id: accountId, deletedAt: null };
      }
      
      const account = await Account.findOne(accountQuery);
      
      if (!account) {
         return next(new AppError("Account not found", 404));
      }
      
      const Thread = require('../db/Thread');
      const Email = require('../db/Email');
      
      // Use aggregation to get threads that have emails of the requested labelType
      // and include the emails directly in the result
      const pipeline = [
         // Match threads for this account
         {
            $match: {
               account: account._id,
               deletedAt: null
            }
         },
         // Lookup emails for each thread
         {
            $lookup: {
               from: 'emails',
               let: { threadId: '$_id' },
               pipeline: [
                  {
                     $match: {
                        $expr: {
                           $and: [
                              { $eq: ['$thread', '$$threadId'] },
                              { $eq: ['$labelType', labelType.toUpperCase()] },
                              { $eq: ['$deletedAt', null] }
                           ]
                        }
                     }
                  },
                  { $sort: { createdAt: -1 } }
               ],
               as: 'emails'
            }
         },
         // Only keep threads that have emails of the requested type
         {
            $match: {
               'emails.0': { $exists: true }
            }
         },
         // Add email count
         {
            $addFields: {
               emailCount: { $size: '$emails' },
               latestEmailDate: { $max: '$emails.createdAt' }
            }
         },
         // Sort by latest email date (most recent first)
         { $sort: { latestEmailDate: -1 } },
         // Pagination
         { $skip: (page - 1) * limit },
         { $limit: parseInt(limit) }
      ];
      
      const filteredThreads = await Thread.aggregate(pipeline);
      
      // Get total count of threads with emails for pagination
      const countPipeline = [
         {
            $match: {
               account: account._id,
               deletedAt: null
            }
         },
         {
            $lookup: {
               from: 'emails',
               let: { threadId: '$_id' },
               pipeline: [
                  {
                     $match: {
                        $expr: {
                           $and: [
                              { $eq: ['$thread', '$$threadId'] },
                              { $eq: ['$labelType', labelType.toUpperCase()] },
                              { $eq: ['$deletedAt', null] }
                           ]
                        }
                     }
                  }
               ],
               as: 'emails'
            }
         },
         {
            $match: {
               'emails.0': { $exists: true }
            }
         },
         { $count: 'total' }
      ];
      
      const countResult = await Thread.aggregate(countPipeline);
      const totalThreads = countResult.length > 0 ? countResult[0].total : 0;
      
      res.status(200).json({
         status: true,
         message: `${labelType} threads fetched successfully`,
         data: {
            account: account,
            threads: filteredThreads,
            pagination: {
               page: parseInt(page),
               limit: parseInt(limit),
               total: totalThreads,
               pages: Math.ceil(totalThreads / limit)
            },
            labelType: labelType.toUpperCase()
         }
      });
   } catch (err) {
      console.error('Get account threads error:', err.message);
      return next(new AppError("Failed to fetch account threads", 500));
   }
});

// Get single thread with all emails and attachments
exports.getSingleThread = catchAsync(async (req, res, next) => {
   const { threadId } = req.params;
   
   try {
      const Thread = require('../db/Thread');
      const Email = require('../db/Email');
      
      // Find the thread and populate account info
      const thread = await Thread.findOne({
         _id: threadId,
         deletedAt: null
      }).populate('account').lean();
      
      if (!thread) {
         return next(new AppError("Thread not found", 404));
      }
      
      // Verify the thread belongs to the requester's account (basic validation)
      // In a multi-user system, you'd check if req.user has access to this account
      if (!thread.account || thread.account.deletedAt) {
         return next(new AppError("Thread account not found or deleted", 404));
      }
      
      // Get all emails in this thread, sorted by date ascending, including attachments
      const emails = await Email.find({
         thread: threadId,
         deletedAt: null
      })
      .sort({ createdAt: 1, date: 1 }) // Sort by date ascending
      .lean();
      
      res.status(200).json({
         status: true,
         message: "Thread fetched successfully",
         data: {
            ...thread,
            emails: emails
         }
      });
   } catch (err) {
      console.error('Get single thread error:', err.message);
      return next(new AppError("Failed to fetch thread", 500));
   }
});

// Download attachment by ID
exports.downloadAttachment = catchAsync(async (req, res, next) => {
   const { id } = req.params;
   
   try {
      const Email = require('../db/Email');
      const path = require('path');
      const fs = require('fs');
      
      console.log(`🔍 Looking for attachment with ID: ${id}`);
      
      // Find the email containing the attachment with this ID or filename
      const email = await Email.findOne({
         'attachments': { 
            $elemMatch: { 
               $or: [
                  { '_id': id },
                  { 'filename': id },
                  { 'filename': { $regex: new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
               ]
            } 
         },
         deletedAt: { $exists: false }
      }).lean();
      
      if (!email) {
         console.log('❌ Email with attachment not found, searching by localPath...');
         // Fallback: search by localPath containing the ID
         const emailByPath = await Email.findOne({
            'attachments': { 
               $elemMatch: { 
                  'localPath': { $regex: new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
               }
            },
            deletedAt: { $exists: false }
         }).lean();
         
         if (!emailByPath) {
            return next(new AppError("Attachment not found", 404));
         }
         
         // Find the specific attachment by path
         let attachment = null;
         if (emailByPath.attachments && Array.isArray(emailByPath.attachments)) {
            attachment = emailByPath.attachments.find(att => 
               att.localPath?.includes(id)
            );
         }
         
         if (!attachment || !attachment.localPath || !fs.existsSync(attachment.localPath)) {
            return next(new AppError("Attachment file not found on server", 404));
         }
         
         console.log(`✅ Found attachment by path: ${attachment.filename}`);
         
         // Set appropriate headers for file download
         res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
         res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
         
         // Stream the file
         const fileStream = fs.createReadStream(attachment.localPath);
         fileStream.pipe(res);
         
         fileStream.on('error', (error) => {
            console.error('File stream error:', error.message);
            if (!res.headersSent) {
               return next(new AppError("Failed to stream attachment", 500));
            }
         });
         return;
      }
      
      // Find the specific attachment
      let attachment = null;
      if (email.attachments && Array.isArray(email.attachments)) {
         attachment = email.attachments.find(att => 
            att._id === id || 
            att.filename === id ||
            att.filename?.includes(id) ||
            att.localPath?.includes(id)
         );
      }
      
      if (!attachment) {
         return next(new AppError("Attachment not found in email", 404));
      }
      
      // Check if file exists on disk
      const filePath = attachment.localPath;
      if (!filePath || !fs.existsSync(filePath)) {
         return next(new AppError("Attachment file not found on server", 404));
      }
      
      console.log(`✅ Found attachment: ${attachment.filename}`);
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
         console.error('File stream error:', error.message);
         if (!res.headersSent) {
            return next(new AppError("Failed to stream attachment", 500));
         }
      });
      
   } catch (err) {
      console.error('Download attachment error:', err.message);
      return next(new AppError("Failed to download attachment", 500));
   }
});

