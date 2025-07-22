
const errorHandler = (err, req, res, next) =>{ 

      //   VALIDATION_ERROR: 400,
      //   UNAUTHORIZED: 401,
      //   FORBIDDEN: 403,
      //   NOT_FOUND: 404,
      //   SERVER_ERROR: 500,
   
      const statusCode = res.statusCode ? res.statusCode  : 500;
      
      switch(statusCode){ 
   
         case 500:
         res.json({
            title: "server error",
            message : err.message,
            stack : err.stack
         });
         break;
   
         case 400:
         res.json({
            title: "Not Found",
            message : err.message,
            stack : err.stack
         });
         break;
   
         case 401:
         res.json({
            title: "Unauthenticated",
            message : err.message,
            stack : err.stack
         });
         break;
   
         case 403:
         res.json({
            title: "Forbidden",
            message : err.message,
            stack : err.stack
         });
         break; 

         default:
         console.log("No Error, All good !");
         break;
      }
   
   }     
module.exports = errorHandler;
