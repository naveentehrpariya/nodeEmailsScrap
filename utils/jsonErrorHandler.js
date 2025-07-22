const JSONerror = (res, err, next) => {  
   if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      res.status(400).json({
        status: false,
        errors: messages,
        message: "Validation Error",
      });
   } else {
      next(err);
   }
}
module.exports = JSONerror;
