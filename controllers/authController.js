const User = require("../db/Users");
const jwt = require("jsonwebtoken");
const catchAsync = require("../utils/catchAsync");
const {promisify} = require("util");
const AppError = require("../utils/AppError");
const JSONerror = require("../utils/jsonErrorHandler");
const logger = require("../utils/logger");
const SECRET_ACCESS = process.env && process.env.SECRET_ACCESS || "secret_access_key";
const bcrypt = require('bcrypt');

const signToken = async (id) => {
  const token = jwt.sign(
    {id}, 
    SECRET_ACCESS, 
    {expiresIn:'14400m'}
  );
  return token
}

const validateToken = catchAsync ( async (req, res, next) => {
  let token;
  let authHeader = req.headers.Authorization || req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
  }
  
  if (!token) {
    return res.status(401).json({
      status: false,
      message: "User is not authorized or Token is missing",
    });
  }

  try {
    const decode = await promisify(jwt.verify)(token, SECRET_ACCESS);
    if (decode) {
      let result = await User.findById(decode.id);
      if (!result) {
        return res.status(401).json({
          status: false,
          message: 'User not found',
        });
      }
      console.log("result", result);
      req.user = result;
      next();
    } else {
      res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
    }
  } catch (err) {
    res.status(401).json({
      status: false,
      message: 'Invalid or expired token',
      error: err
    });
  }
});

const signup = catchAsync(async (req, res, next) => {
  // await User.syncIndexes();
  // User.create({
  //   name : 'Admin',
  //   email: 'admin@gmail.com',
  //   password: '123'
  // }).then(result => {
  //   result.password = undefined;
  //   res.send({
  //     status: true,
  //     user: result,
  //     message: "Account has been created.",
  //   });
  // }).catch(err => {
  //   JSONerror(res, err, next);
  //   logger(err);
  // });
});
 
const login = catchAsync ( async (req, res, next) => { 
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

const logout = catchAsync(async (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(Date.now() + 10 * 1000), // Expire in 10 seconds
    httpOnly: true,
  });
  res.status(200).json({
    status: true,
    message: 'Logged out successfully !!!'
  });
});

const profile = catchAsync ( async (req, res) => {
  if(req.user){
     res.status(200).json({
      status:true,
      user : req.user,
    });
  } else {
    res.status(200).json({
     status:false,
     message:"Unauthorized",
    });
  }
});

module.exports = {signup, login, validateToken, logout, profile };
