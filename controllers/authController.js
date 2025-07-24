const User = require("../db/Users");
const jwt = require("jsonwebtoken");
const catchAsync = require("../utils/catchAsync");
const {promisify} = require("util");
const AppError = require("../utils/AppError");
const SendEmail = require("../utils/Email");
const crypto = require("crypto");
const JSONerror = require("../utils/jsonErrorHandler");
const logger = require("../utils/logger");
const SECRET_ACCESS = process.env && process.env.SECRET_ACCESS || "MYSECRET";
const bcrypt = require('bcrypt');
const Company = require("../db/Company");
const EmployeeDoc = require("../db/Attachment");

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
      let result = await User.findById(decode.id).populate('company');
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
  const { role, name, email, avatar, password, generateAutoPassword, staff_commision, position } = req.body;
  if(req.user && req.user.is_admin !== 1){
    return res.json({
      status : false,
      message : "You are not authorized to create user."
    });
  }

  const isEmailUsed = await User.findOne({email : email});
  let generatedPassword = password || '';
  if(generateAutoPassword === 1){
    generatedPassword = crypto.randomBytes(10).toString('hex');
  }

  if(isEmailUsed){
    res.json({
      status : false,
      message : "Your given email address is already used."
    });
  }

  let corporateID;
  let isUnique = false;
  while (!isUnique) {
    corporateID = `CCID${Math.floor(100000 + Math.random() * 900000)}`;
    const existingUser = await User.findOne({ corporateID });
    if (!existingUser) {
      isUnique = true;
    }
  }

  await User.syncIndexes();
  User.create({
    name: name,
    email: email, 
    staff_commision : role === 1 ? staff_commision : null,
    avatar: avatar || '',
    corporateID: corporateID,
    created_by:req.user && req.user._id,
    password: generatedPassword,
    country: req.body.country,
    phone: req.body.phone,
    address: req.body.address,
    role: role,
    company:req.user && req.user.company ? req.user.company._id : null,
    position:position,
    confirmPassword: generatedPassword,
  }).then(result => {
    result.password = undefined;
    res.send({
      status: true,
      generatedUser : {
        name: name,
        generatedPassword: generatedPassword,
        email: email,
        role : role,
        corporateID: corporateID
      },
      user: result,
      message: "User has been created.",
    });
  }).catch(err => {
    JSONerror(res, err, next);
    logger(err);
  });
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


module.exports = {signup, login, validateToken, logout };
