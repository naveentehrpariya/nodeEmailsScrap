const catchAsync = require("../utils/catchAsync");
const APIFeatures  = require("../utils/APIFeatures");
const Order = require("../db/Order");
const Files = require("../db/Files");
const JSONerror = require("../utils/jsonErrorHandler");
const Commudity = require("../db/Commudity");
const Equipment = require("../db/Equipment");
const Charges = require("../db/Charges");
const PaymentLogs = require("../db/PaymentLogs");

async function CreatePaymentLog(user, order, status, method, type, approval) {
   const payment = PaymentLogs.create({
      order: order,
      method: method,
      status: status,
      type: type,
      approval: "approved",
      updated_by: user,
   });
   console.log(payment);
   return payment;
}

exports.create_order = catchAsync(async (req, res, next) => {
   try {

      const { company_name,
         customer_order_no,
         shipping_details,

         // Customer
         customer,
         customer_payment_date,
         customer_payment_method,
         total_amount,

         // Carrier
         carrier,
         carrier_amount,
         carrier_payment_date,
         carrier_payment_method,

         
         // Revennue
         revenue_items,
         carrier_revenue_items,
         revenue_currency,

         totalDistance,

         order_status,
       } = req.body;
 
      const lastOrder = await Order.findOne().sort({ serial_no: -1 });
      const newOrderId = lastOrder ? parseInt(lastOrder.serial_no) + 1 : 1000;
      const order = await Order.create({
         company_name,
         serial_no : parseInt(newOrderId),
         shipping_details,

         customer : customer,
         customer_payment_date,
         customer_payment_method,
         total_amount,

         carrier,
         carrier_amount, 
         carrier_payment_date,
         carrier_payment_method,

         revenue_items,
         carrier_revenue_items,
         revenue_currency,
         totalDistance,
         order_status,
         company:req.user && req.user.company ? req.user.company._id : null,

         created_by : req.user._id,
      });
   
      if(!order){
         res.json({
            status:false,
            message: "Failed to create order."
         });
      }
      res.json({
         status:true,
         order,
         message: "Order has been created."
      });
   } catch (err) {
      JSONerror(res, err, next);
   }
});

exports.order_listing = catchAsync(async (req, res, next) => {
   const { search, customer_id, carrier_id, sortby, status, paymentStatus } = req.query;
   
   console.log(req.query)
   const queryObj = {
      $or: [{ deletedAt: null }]
   };

   if(paymentStatus){
      queryObj.carrier_payment_status = paymentStatus;
      queryObj.customer_payment_status = paymentStatus;
   }
   
   if(customer_id){
      queryObj.customer = customer_id;
   }

   if(carrier_id){
      queryObj.carrier = carrier_id;
   }
   if(status == 'added' || status == 'intransit' || status == 'completed'){
      queryObj.order_status = status;
   }

   if (req.user && req.user.role !== 1) {
   }  else {
      queryObj.created_by = req.user._id;
   }

   if (search && search.length >1) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      queryObj.serial_no = { $regex: new RegExp(safeSearch, 'i') };
   }

   console.log("queryObj",queryObj)
   let Query = new APIFeatures(
      Order.find(queryObj).populate(['created_by', 'customer', 'carrier', 'carrier_payment_updated_by', 'customer_payment_updated_by']),
      req.query
   ).sort({ createdAt: 1 });

   const { query, page, limit, totalPages } = await Query.paginate();
   let data = await query;

   if(sortby !== 'date'){
      const statusPriority = { added: 0, intransit: 1, completed: 2 };
      data.sort((a, b) => {
         return statusPriority[a.order_status] - statusPriority[b.order_status];
      });
   }

   res.json({
      status: true,
      orders: data,
      page : page,
      totalPages : totalPages,
      message: data.length ? undefined : "No files found"
   });
});

exports.order_listing_account = catchAsync(async (req, res) => {
   try {
      const { search } = req.query;
      const queryObj = {
         $or: [{ deletedAt: null }]
      };
      if (search && search.length >1) {
         const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
         queryObj.customer_order_no = { $regex: new RegExp(safeSearch, 'i') };
      }
      let Query = new APIFeatures(
         Order.find(queryObj).populate(['created_by', 'customer', 'carrier', 'carrier_payment_updated_by', 'customer_payment_updated_by']),
         req.query
      ).sort({ createdAt: 1 });

      const { query, totalDocuments, page, limit, totalPages } = await Query.paginate();
      let data = await query;

      const statusPriority = { added: 0, intransit: 1, completed: 2 };
      data.sort((a, b) => {
         return statusPriority[a.order_status] - statusPriority[b.order_status];
      });

      res.json({
         status: true,
         orders: data,
         totalDocuments,
         page,
         limit,
         totalPages,
         message: data.length ? undefined : "No orders found",
      });
   } catch (error) {
      res.status(500).json({
         status: false,
         message: "Something went wrong",
         error: error.message,
      });
   }
});

exports.updateOrderPaymentStatus = catchAsync(async (req, res) => {
   try { 
      const { status, method, notes } = req.body;
      let order;
      if(req.params.type === 'customer'){ 
            order = await Order.findByIdAndUpdate(req.params.id, {
               customer_payment_status : status,
               customer_payment_date  : Date.now(),
               customer_payment_method : method,
               customer_payment_notes : notes,
               customer_payment_updated_by : req?.user?._id,
               customer_payment_approved_by_admin : req?.user?.is_admin == 1 ? 1 : 0,
            }, {
              new: true, 
              runValidators: true,
            });
         await CreatePaymentLog(req.user?._id, req.params.id, status, method, 'customer', req?.user?.is_admin == 1 ? 'admin' : null);
      } else { 
         order = await Order.findByIdAndUpdate(req.params.id, {
            carrier_payment_status :status,
            carrier_payment_date : Date.now(),
            carrier_payment_method : method,
            carrier_payment_notes : notes,
            carrier_payment_updated_by : req?.user?._id,
            carrier_payment_approved_by_admin : req?.user?.is_admin == 1 ? 1 : 0,
         },{
           new: true, 
           runValidators: true,
         });
         await CreatePaymentLog(req.user?._id, req.params.id, status, method, "carrier", req?.user?.is_admin == 1 ? 'admin' : null);
      }
      if(!order){ 
        res.send({
          status: false,
          carrier : order,
          message: "failed to update order information.",
        });
      } 
      console.log(order);
      res.send({
         status: true,
         error : order,
         message: "Payment status has been updated.",
      });
   } catch (error) {
      console.log(error);
      res.send({
        status: false,
        error :error,
        message: "Failed to update order information.",
      });
    }
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
   try { 
      const { status } = req.body;
      const order  = await Order.findByIdAndUpdate(req.params.id, {
         order_status : status,
         updatedAt : Date.now(),
      }, {
         new: true, 
         runValidators: true,
      });
      if(!order){ 
        res.send({
          status: false,
          carrier : order,
          message: "failed to update order information.",
        });
      } 
      res.send({
        status: true,
        error :order,
        message: "Order status has been updated.",
      });
    } catch (error) {
      res.send({
        status: false,
        error :error,
        message: "Failed to update order information.",
      });
    }
});

exports.addnote = catchAsync(async (req, res) => {
   try { 
      const { notes } = req.body;
      console.log("req.params.id",req.params.id)
      const order  = await Order.findByIdAndUpdate(req.params.id, {
         notes : notes,
         updatedAt : Date.now(),
      }, {
         new: true, 
         runValidators: true,
      });
      if(!order){ 
        res.send({
          status: false,
          carrier : order,
          message: "failed to add note on this order.",
        });
      } 
      console.log("order",order)
      res.send({
        status: true,
        error :order,
        message: "Note has been added.",
      });
    } catch (error) {
      res.send({
        status: false,
        error :error,
        message: "Failed to update order information.",
      });
    }
});

exports.overview = catchAsync(async (req, res) => {
   let customercompletedPayments, customerpendingPayments, totalLoads, intransitLoads, completedLoads, pendingLoads, carriercompletedPayments, carrierpendingPayments;
   const notDeletedFilter = {
      created_by: req.user._id,
      $or: [
         { deletedAt: null },
         { deletedAt: '' },
         { deletedAt: { $exists: false } }
      ],
   };
   if(req.user.role === 1){
      totalLoads = await Order.countDocuments({notDeletedFilter});
      intransitLoads = await Order.countDocuments({ order_status: 'intransit', ...notDeletedFilter });
      completedLoads = await Order.countDocuments({ order_status: 'completed', ...notDeletedFilter });
      pendingLoads = await Order.countDocuments({ order_status: 'added', ...notDeletedFilter });

      // carrier
      carrierpendingPayments = await Order.countDocuments({ carrier_payment_status: { $ne: 'paid' }, ...notDeletedFilter });
      carriercompletedPayments = await Order.countDocuments({ carrier_payment_status: 'paid', ...notDeletedFilter });
      // customer
      customercompletedPayments = await Order.countDocuments({ customer_payment_status: 'paid', ...notDeletedFilter });
      customerpendingPayments = await Order.countDocuments({ customer_payment_status: { $ne: 'paid' }, ...notDeletedFilter });

   } else {
      totalLoads = await Order.countDocuments();
      intransitLoads = await Order.countDocuments({ order_status: 'intransit'});
      completedLoads = await Order.countDocuments({ order_status: 'completed'});
      pendingLoads = await Order.countDocuments({ order_status: 'added'});

      // carrier
      carrierpendingPayments = await Order.countDocuments({ carrier_payment_status: { $ne: 'paid' } });
      carriercompletedPayments = await Order.countDocuments({ carrier_payment_status: 'paid'  });
      // customer
      customercompletedPayments = await Order.countDocuments({ customer_payment_status:  'paid'  });
      customerpendingPayments = await Order.countDocuments({ customer_payment_status: { $ne: 'paid' } });
   }
   res.json({
      status: true,
      message: 'Dashboard data retrieved successfully.',
      lists: [
         { icon:"van",bg:'bg-green-700', title : 'Total Loads', data: totalLoads, link: '/orders' },
         { icon:"van",bg:'bg-green-700', title : 'Intransit Loads', data: intransitLoads, link:"/orders?status=intransit" },
         { icon:"van",bg:'bg-green-700', title : 'Completed Loads', data: completedLoads, link:"/orders?status=completed" },
         { icon:"van",bg:'bg-green-700', title : 'Pending Loads', data: pendingLoads, link:"/orders?status=added" },

         { icon:"card",bg:'bg-green-700', title : 'Carrier Pending Payments', data: carrierpendingPayments, link:"/payments?title=Carrier Pending Payments&type=carrier&status=pending" },
         { icon:"card",bg:'bg-green-700', title : 'Carrier Done Payments', data: carriercompletedPayments, link:"/payments?title=Carrier Completed Payments&type=carrier&status=paid" },

         { icon:"card",bg:'bg-green-700', title : 'Customer Pending Payments', data: customerpendingPayments, link:"/payments?title=Customer Pending Payments&type=customer&status=pending" },
         { icon:"card",bg:'bg-green-700', title : 'Customer Done Payments', data: customercompletedPayments, link:"/payments?title=Customer Completed Payments&type=customer&status=paid" },
      ] 
   });
});

exports.order_detail = catchAsync(async (req, res) => {
   const id = req.params.id;
   const order = await Order.findOne({
      _id : id,
      deletedAt : null || ''
    }).populate(['created_by', 'customer', 'carrier']);
   
    if(!order){ 
      res.json({
         status: false,
         orders: null, 
         message: "Order not found."
       });
    }
   res.json({
      status: true,
      order: order
   });
});

exports.order_docs = catchAsync(async (req, res) => {
   const id = req.params.id;
   const files = await Files.find({
      order : id,
      deletedAt : null || ''
    }).populate('added_by');
    let paymentLogs = await PaymentLogs.find({order: id}).populate('updated_by');
    paymentLogs = paymentLogs ? paymentLogs.reverse() : [];
    if(!files){ 
      res.json({
         status: false,
         files: null,
         paymentLogs: paymentLogs ?? [],
         message: "files not found."
       });
    }
    console.log("files",files)
   res.json({
      status: true,
      paymentLogs: paymentLogs ?? [],
      files: files,
   });
});

exports.lockOrder = catchAsync(async (req, res) => {

   if(req.user && req.user.is_admin !== 1){
      return res.json({
         status : false,
         message : "You are not authorized to lock order."
      });
   }
   const id = req.params.id;
   const order = await Order.findById(id);
   if(!order){ 
      res.json({
         status: false,
         message: "Order not found."
       });
   }
   if(order.lock){
      order.lock = null;
   } else {
      order.lock = true
   }
   await order.save();
   res.json({
      status: true,
      'Message': "Order locked status updated.",
   });
});


exports.deleteOrder = catchAsync(async (req, res) => {
   if(req.user && req.user.is_admin !== 1){
      return res.json({
         status : false,
         message : "You are not authorized to delete this order."
      });
   }

   const id = req.params.id;
   const order = await Order.findById(id);
   if(!order){ 
      res.json({
         status: false,
         message: "Order not found."
       });
   }
   order.deletedAt = Date.now();
   await order.save();
   res.json({
      status: true,
      message: "Order deleted successfully."
   });
});

exports.addCummodity = catchAsync(async (req, res, next) => {
   const { value } = req.body;
   Commudity.create({
      name: value,
      company:req.user && req.user.company ? req.user.company._id : null,
   }).then(result => {
      res.send({
      status: true,
      message: "Commudity has been added.",
   });
   }).catch(err => {
      JSONerror(res, err, next);
      logger(err);
   });
});

exports.removeCummodity = catchAsync(async (req, res, next) => {
   const { id } = req.body;
   Commudity.findByIdAndDelete(id)
     .then(() => {
       res.send({
         status: true,
         message: "Commudity has been permanently removed.",
       });
     })
     .catch(err => {
       JSONerror(res, err, next);
       logger(err);
     });
});

exports.cummodityLists = catchAsync(async (req, res, next) => {
   const list = await Commudity.find({});
   const arr = [];
   list.map((item) => {
      arr.push({
         value: item.name,
         label: item.name,
         _id: item._id,
      });
   })
   res.send({
      status: true,
      list: arr ,
   });
});

exports.addEquipment = catchAsync(async (req, res, next) => {
   const { value } = req.body;
   Equipment.create({
      name: value,
      company:req.user && req.user.company ? req.user.company._id : null,
   }).then(result => {
      res.send({
      status: true,
      message: "Equipment has been added.",
   });
   }).catch(err => {
      JSONerror(res, err, next);
      logger(err);
   });
});

exports.removeEquipment = catchAsync(async (req, res, next) => {
   const { id } = req.body;
   console.log("id",id)
   Equipment.findByIdAndDelete(id)
     .then(() => {
       res.send({
         status: true,
         message: "Equipment has been permanently removed.",
       });
     })
     .catch(err => {
       JSONerror(res, err, next);
       logger(err);
     });
});

exports.equipmentLists = catchAsync(async (req, res, next) => {
   const list = await Equipment.find({});
   const arr = [];
   list.map((item) => {
      arr.push({
         value: item.name,
         label: item.name,
         _id: item._id,
      });
   })
   res.send({
      status: true,
      list: arr ,
   });
});

exports.addCharges = catchAsync(async (req, res, next) => {
   const { value } = req.body;
   Charges.create({
      name: value,
      company:req.user && req.user.company ? req.user.company._id : null,
   }).then(result => {
      res.send({
      status: true,
      message: "Charge item has been added.",
   });
   }).catch(err => {
      JSONerror(res, err, next);
      logger(err);
   });
});

exports.removeCharge = catchAsync(async (req, res, next) => {
   const { id } = req.body;
   Charges.findByIdAndDelete(id)
     .then(() => {
       res.send({
         status: true,
         message: "Charge has been permanently removed.",
       });
     })
     .catch(err => {
       JSONerror(res, err, next);
       logger(err);
     });
});

exports.chargesLists = catchAsync(async (req, res, next) => {
   const list = await Charges.find({});
   const arr = [];
   list.map((item) => {
      arr.push({
         value: item.name,
         label: item.name,
         _id: item._id,
      });
   })
   res.send({
      status: true,
      list: arr ,
   });
});

exports.orderPayments = catchAsync(async (req, res, next) => {
   const { search, customer_id, carrier_id, sortby } = req.query;
   const queryObj = {
      $or: [{ deletedAt: null }]
   };

   if(customer_id){
      queryObj.customer = customer_id;
   }
   if(carrier_id){
      queryObj.carrier = carrier_id;
   }

   let Query = new APIFeatures(
      Order.find(queryObj).populate(['created_by', 'customer', 'carrier']),
      req.query
   ).sort({ createdAt: 1 });

   const { query, page, limit, totalPages } = await Query.paginate();
   let data = await query;

   if(sortby !== 'date'){
      const statusPriority = { added: 0, intransit: 1, completed: 2 };
      data.sort((a, b) => {
         return statusPriority[a.order_status] - statusPriority[b.order_status];
      });
   }
   res.json({
      status: true,
      orders: data,
      page : page,
      totalPages : totalPages,
      message: data.length ? undefined : "No files found"
   });
});

exports.all_payments_status = catchAsync(async (req, res, next) => {
   const { search, type, status } = req.query;
   const queryObj = {
      $or: [{ deletedAt: null }]
   };
   if(type == 'carrier'){
      if(status == 'pending'){
         queryObj.carrier_payment_status = { $ne: 'paid' };
      } else{
         queryObj.carrier_payment_status = status;
      }
   }
   if(type == 'customer'){
      if(status == 'pending'){
         queryObj.customer_payment_status = { $ne: 'paid' };
      } else{
         queryObj.customer_payment_status = status;
      }
   }
    
   let Query = new APIFeatures(
      Order.find(queryObj).populate(['created_by', 'customer', 'carrier']),
      req.query
   ).sort({ createdAt: 1 });

   const { query, page, limit, totalPages } = await Query.paginate();
   let data = await query;

   // if(sortby !== 'date'){
   //    const statusPriority = { added: 0, intransit: 1, completed: 2 };
   //    data.sort((a, b) => {
   //       return statusPriority[a.order_status] - statusPriority[b.order_status];
   //    });
   // }
   res.json({
      status: true,
      lists: data,
      page : page,
      totalPages : totalPages,
      message: data.length ? undefined : "No files found"
   });
});



 



 