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
const EmployeeDoc = require("../db/EmployeeDoc");

const signToken = async (id) => {
  const token = jwt.sign(
    {id}, 
    SECRET_ACCESS, 
    {expiresIn:'14400m'}
  );
  return token
}

const validateToken = catchAsync ( async (req, res, next) => {
  // First check for JWT in cookies (preferred for security)
  let token = req.cookies?.jwt;
  
  // Fallback to Authorization header for backward compatibility
  if (!token) {
    let authHeader = req.headers.Authorization || req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }
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
  
const editUser = catchAsync(async (req, res, next) => {
  if(req.user && req.user.is_admin !== 1){
    return res.json({
      status : false,
      message : "You are not authorized to access this route."
    });
  }
  const existedUser = await User.findById(req.params.id);
  if(req.body.email !== existedUser?.email){
    res.json({
      status : false,
      message : "Your given email address is already used."
    });
  } 
  User.findByIdAndUpdate(req.params.id, {
    name: req.body.name,
    email: req.body.email, 
    staff_commision : req.body.role === 1 ? req.body.staff_commision : null,
    country: req.body.country,
    phone: req.body.phone,
    position: req.body.position,
    address: req.body.address,
    role: req.body.role,
  }).then(result => {
    result.password = undefined;
    res.send({
      status: true,
      user: result,
      message: "User has been updated.",
    });
  }).catch(err => {
    JSONerror(res, err, next);
    logger(err);
  });
});

const suspandUser = catchAsync(async (req, res, next) => {
  if(req.user && req.user.is_admin !== 1){
    return res.json({
      status : false,
      message : "You are not authorized to access this route."
    });
  }
  const existedUser = await User.findById(req.params.id);
  User.findByIdAndUpdate(req.params.id, {
    status: existedUser.status === 'active' ? 'inactive' : "active", 
  }).then(result => {
    result.password = undefined;
    res.send({
      status: true,
      user: result,
      message: `User account has been ${existedUser.status === 'active' ? 'suspended' : "reactivated."}`,
    });
  }).catch(err => {
    JSONerror(res, err, next);
    logger(err);
  });
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
   const { email, password, corporateID } = req.body;
   if(!email || !password){
      return next(new AppError("Email and password is required !!", 401))
   }
    const user = await User.findOne({ email }).select('+password').lean();
    
    if (!user) {
        return res.status(200).json({ status: false, message: "Invalid Details" });
    } 

    if (user.status === 'inactive') {
        return res.status(200).json({ status: false, message: "Your account is suspended!" });
    }
    const pp= await bcrypt.compare(password, user.password)
    console.log("await bcrypt.compare(password", pp);

   if((user.corporateID !== corporateID) || !user || !(await bcrypt.compare(password, user.password))){
    res.status(200).json({
      status : false, 
      message:"Details are invalid.",
     });   
   }

   const token = await signToken(user._id);
  //  res.cookie('jwt', token, {
  //   expires:new Date(Date.now() + 30*24*60*60*1000),
  //   httpOnly:true,
  //  });
   res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use true in production (HTTPS)
    sameSite: 'Strict', // or 'Lax' for less strict
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  user.password = undefined;
  user.confirmPassword = undefined;
   res.status(200).json({
    status :true,
    message:"Login Successfully !!",
    user : user,
    // token
   });
});

const profile = catchAsync ( async (req, res) => {
  const company = await Company.findOne({});
  if(req.user){
     res.status(200).json({
      status:true,
      user : req.user,
      company : company,
    });
  } else {
    res.status(200).json({
     status:false,
     message:"Unauthorized",
    });
  }
});

const employeesLisiting = catchAsync ( async (req, res) => {
  let lists;
  if(req.user && req.user.isSuper === '1'){
     lists = await User.find({isSuper: {$ne:1}});
  } else {
     lists = await User.find({is_admin: {$ne:1}});
  }
  if(lists){
     res.status(200).json({
      status:true,
      lists : lists,
    });
  } else {
    res.status(200).json({
     status:false,
     message: []
    });
  }
});

const employeesDocs = catchAsync ( async (req, res) => {
  const employeeId = req.params.id;
  const documents = await EmployeeDoc.find({ user: employeeId }).populate('added_by').sort({ createdAt: -1 });
  console.log("documents", documents);
  if (documents) {
    res.status(200).json({
      status: true,
      documents: documents,
    });
  } else {
    res.status(200).json({
      status: false,
      message: "No documents found for this employee.",
    });
  }
});

const forgotPassword = catchAsync ( async (req, res, next) => {
  const user = await User.findOne({email:req.body.email});
  if(!user){
    res.json({
      status:false,
      message:"No user found associated with this email.",
    }); 
  } 
  const resetToken = await user.createPasswordResetToken();
  await user.save({validateBeforeSave:false});
  const resetTokenUrl = `${process.env.DOMAIN_URL}/user/resetpassword/${resetToken}`;
  const message = `<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0;">
  <meta name="format-detection" content="telephone=no" />

  <style>
    body{margin:0;padding:0;min-width:100%;width:100% !important;height:100% !important;}
body,table,td,div,p,a{-webkit-font-smoothing:antialiased;text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;line-height:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse !important;border-spacing:0;}
img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
#outlook a{padding:0;}
.ReadMsgBody{width:100%;}
.ExternalClass{width:100%;}
.ExternalClass,.ExternalClass p,.ExternalClass span,.ExternalClass font,.ExternalClass td,.ExternalClass div{line-height:100%;}
@media all and (min-width:560px){body{margin-top:30px;}
}
/* Rounded corners */
 @media all and (min-width:560px){.container{border-radius:8px;-webkit-border-radius:8px;-moz-border-radius:8px;-khtml-border-radius:8px;}
}
/* Links */
 a,a:hover{color:#127DB3;}
.footer a,.footer a:hover{color:#999999;}

  </style>
  <title>🔒 Reset Your Password</title>
</head>

<!-- BODY -->
<body topmargin="0" rightmargin="0" bottommargin="0" leftmargin="0" marginwidth="0" marginheight="0" width="100%" style="border-collapse: collapse; border-spacing: 0;  padding: 0; width: 100%; height: 100%; -webkit-font-smoothing: antialiased; text-size-adjust: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; line-height: 100%;
	background-color: #ffffff;
	color: #000000;" bgcolor="#ffffff" text="#000000">
  <table width="100%" align="center" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; width: 100%;" class="background">
    <tr>
      <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0;" bgcolor="#ffffff">
        <table border="0" cellpadding="0" cellspacing="0" align="center" bgcolor="#FFFFFF" width="560" style="border-collapse: collapse; border-spacing: 0; padding: 0; width: inherit;
	max-width: 560px;" class="container">
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%; font-size: 24px; font-weight: bold; line-height: 130%;padding-top: 25px;color: #000000;font-family: sans-serif;" class="header">
              <img border="0" vspace="0" hspace="0" src="https://runstream.co/logo-white.png" style="max-width: 250px;" alt="The Idea" title="Runstream" />
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%;
			padding-top: 25px;" class="line">
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%; font-size: 17px; font-weight: 400; line-height: 160%;
			padding-top: 25px; 
			color: #000000;
			font-family: sans-serif;" class="paragraph">
              Hi ${user.name || ""},<br> We received a request to reset your password for your runstream account. No worries, it happens to the best of us!
              <br>
              To reset your password, please click the button below:
              <br>
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%; padding-top: 25px;padding-bottom: 5px;" class="button">
                <table border="0" cellpadding="0" cellspacing="0" align="center" style=" min-width: 120px; border-collapse: collapse; border-spacing: 0; padding: 0;">
                  <tr>
                    <td align="center" valign="middle" style="border-collapse: collapse;"  >
                      <a target="_blank" style="padding: 12px 24px; margin: 0; border-collapse: collapse; text-decoration: none; border-spacing: 0; border-radius: 10px; -webkit-border-radius: 10px; -moz-border-radius: 10px; -khtml-border-radius: 10px; background: #df3939; text-decoration: none; max-width: 240px;
                        color: #FFFFFF; font-family: sans-serif; font-size: 17px; font-weight: 400; line-height: 120%;"  href=${resetTokenUrl}>
                          Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%;
			padding-top: 25px;" class="line">
            </td>
          </tr>
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%; font-size: 17px; font-weight: 400; line-height: 160%;
			padding-top: 20px;
			padding-bottom: 25px;
			color: #000000;
			font-family: sans-serif;" class="paragraph">
              If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:Support@runstream.co" target="_blank" style=" color: #4b57ff; ">support@runstream.co</a>. We’re here to help!. 
            </td>
          </tr>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" align="center" width="560" style="border-collapse: collapse; border-spacing: 0; padding: 0; width: inherit;
	max-width: 560px;" class="wrapper">
          <tr>
            <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; padding-left: 6.25%; padding-right: 6.25%; width: 87.5%; font-size: 13px; font-weight: 400; line-height: 150%;
			padding-top: 20px;
			padding-bottom: 20px;
			color: #999999;
			font-family: sans-serif;" class="footer">
              For more information <a href="https://runstream.co/contact" target="_blank" style=" color: #999999; ">contact us</a>. Our support
              team is available to help you 24 hours a day, seven days a week.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  try {
    const send = await SendEmail({
      email:user.email,
      subject:"🔒 Reset Your Password",
      message
    });
    console.log('send', send);
    res.status(200).json({
      status:true,
      message:"Password Reset link sent your email address."
    })
  } catch (err){
    console.log("err",err)
    user.passwordResetToken = undefined;
    user.resetTokenExpire = undefined;
    await user.save({ validateBeforeSave:false });
    next(
      res.status(200).json({
        status:false,
        message:"Failed to reset your password. Please try again later."
      })
    )
  }
});

const resetpassword = catchAsync ( async (req, res, next) => {
  if(req.body.password !== req.body.confirmPassword){ 
    res.json({
      status:false,
      message:"Confirm password is incorrect. Please try again later.",
    }); 
  }
  const hashToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    passwordResetToken:hashToken,
    resetTokenExpire : { $gt: Date.now()}
  });
  if(!user){ 
    res.json({
      status:false,
      message:"Link expired or invalid token.",
    }); 
  }
  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  user.resetTokenExpire = undefined;
  await user.save({validateBeforeSave:false});
  res.json({
    status:true,
    message:"Password changed successfully.",
  }); 
});

const addCompanyInfo = catchAsync ( async (req, res, next) => {
  const {name, email, phone, address, companyID} = req.body;
  if(companyID){
    const existing = await Company.findOne({companyID : companyID});
    if(existing){
      existing.name = name !== '' || name !== undefined ? name : existing.name;
      existing.email = email !== '' || email !== undefined ? email : existing.email;
      existing.address = address  !== '' || address !== undefined ? address : existing.address;
      existing.phone = phone !== '' || phone !== undefined ? phone : existing.phone;
      await existing.save();
      return res.send({
        status: true,
        company :existing,
        message: "Details has been updated.",
      });
    }
  }
  await Company.syncIndexes();
  Company.create({
    name: name,
    email: email,
    address: address,
    phone: phone,
  }).then(result => {
    res.send({
      status: true,
      company :result,
      message: "Details has been updated.",
    });
  }).catch(err => {
    JSONerror(res, err, next);
    logger(err);
  });
});

const changePassword = async (req, res) => {
    try {
        const { id, password } = req.body;

        // 1. Find the user with password field included
        const user = await User.findById(id).select('+password');
        if (!user) return res.status(200).json({ 
          status: false,
          message: 'User not found.' 
        });

        // // 2. Check if current password matches
        // const isMatch = await user.checkPassword(password, user.password);
        // if (!isMatch) return res.status(401).json({ 
        //   status: false,
        //   message: 'Current password is incorrect.'
        // });

        user.password = password;
        user.changedPasswordAt = Date.now();
        await user.save();

        res.status(200).json({ 
          status:true,
          message: 'Password updated successfully.'
         });

    } catch (err) {
        console.error(err);
        res.status(500).json({ 
          status:false,
          message: 'Server error.'
         });
    }
};

const logout = catchAsync(async (req, res) => {
  // Clear the JWT cookie
  res.cookie('jwt', '', {
    expires: new Date(Date.now() + 10 * 1000), // Expire in 10 seconds
    httpOnly: true,
  });
  
  res.status(200).json({
    status: true,
    message: 'Logged out successfully !!!'
  });
});


module.exports = {  changePassword, addCompanyInfo, suspandUser, editUser, employeesLisiting, signup, login, validateToken, profile, forgotPassword, resetpassword, employeesDocs, logout };
