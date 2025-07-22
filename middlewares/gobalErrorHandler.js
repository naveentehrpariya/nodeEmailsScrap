const serverError = (err, res) => { 
   res.status(err.statusCode).json({
      message : err.message,
      error : err.status
   });
}

const devError = (err, res) => { 
   res.status(err.statusCode).json({
      message : err.message,
      error : err,
      error_stack : err.stack,
      error_status : err.status
   });
}

module.exports = (err, req, res, next)=>{
   err.statusCode = err.statusCode || 500;
   err.status = err.status || 'error';

   if(process.env.NODE_ENV === 'development'){
      // if(!err.isOperation){
         devError(err, res);
      // } else {
      //    res.status(500).json({
      //       error:err,
      //       message:"something went very wrong"
      //    });
      // }
   } else if (process.env.NODE_ENV === 'production') {
         serverError(err, res);
   }
  
};