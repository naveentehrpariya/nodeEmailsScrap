const Order = require('../db/Order');
const catchAsync = require('../utils/catchAsync');

const restrictOrderMiddleware = catchAsync(async (req, res, next) => {
   const order = await Order.findById(req.params.id);
   if (order.lock) {
      res.json({ 
         status: false,
         message: 'This order is locked and can not be modified.',
      });
   } else {
      next();
   }
});
module.exports = restrictOrderMiddleware;