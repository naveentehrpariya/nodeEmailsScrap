const User = require("../db/Users");
const catchAsync = require("../utils/catchAsync");
const {promisify} = require("util");
const AppError = require("../utils/AppError");
const bcrypt = require('bcrypt');
const Account = require("../db/Account");
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

