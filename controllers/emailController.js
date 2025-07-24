const User = require("../db/Users");
const catchAsync = require("../utils/catchAsync");
const {promisify} = require("util");
const AppError = require("../utils/AppError");
const bcrypt = require('bcrypt');
 
exports.login = catchAsync ( async (req, res, next) => { 
   const { email, password } = req.body;
   if(!email || !password){
      return next(new AppError("Email and password is required !!", 401))
   }
    const user = await User.findOne({ email }).select('+password').lean();
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

