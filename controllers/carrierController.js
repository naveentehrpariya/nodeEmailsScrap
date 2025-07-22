const catchAsync = require("../utils/catchAsync");
const APIFeatures  = require("../utils/APIFeatures");
const Carrier = require("../db/Carrier");
const JSONerror = require("../utils/jsonErrorHandler");
const logger = require("../utils/logger");
const axios = require("axios");
 
exports.addCarrier = catchAsync(async (req, res, next) => {
  const { name, phone, email, location, country, state, city, zipcode, secondary_email, secondary_phone, mc_code } = req.body;
  const existingCarrier = await Carrier.findOne({mc_code});
    if (existingCarrier) {
    return res.status(200).json({
      status: false,
      message:"MC code already exists. Please use a different MC code." 
    });
  }

  let carrierID;
  let isUnique = false;
  while (!isUnique) {
    carrierID = `CR_ID${Math.floor(100000 + Math.random() * 900000)}`;
    const existingUser = await Carrier.findOne({ carrierID });
    if (!existingUser) {
      isUnique = true;
    }
  }

  await Carrier.syncIndexes();
  Carrier.create({
    name: name,
    email: email,
    location: location,
    phone: phone,
    carrierID: carrierID,
    country: country,
    state: state,
    city: city,
    zipcode: zipcode,
    created_by:req.user._id,
    mc_code: mc_code,
    company:req.user && req.user.company ? req.user.company._id : null,
    secondary_email: secondary_email,
    secondary_phone: secondary_phone
  }).then(result => {
    res.send({
      status: true,
      driver :result,
      message: "Carrier has been added.",
    });
  }).catch(err => {
    JSONerror(res, err, next);
    logger(err);
  });
});

exports.carriers_listing = catchAsync(async (req, res) => {

    const { search } = req.query;
    const queryObj = {
      $or: [{ deletedAt: null }]
    };

    if (search && search.length >1) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isNumber = !isNaN(search);
      if (isNumber) {
        queryObj.mc_code = { $regex: new RegExp(safeSearch, 'i') };
      } else {
        queryObj.name = { $regex: new RegExp(safeSearch, 'i') };
      }
    }

    let Query = new APIFeatures(Carrier.find(queryObj).populate('created_by'), req.query ).sort();
    const { query, totalDocuments, page, limit, totalPages } = await Query.paginate();
    const data = await query;
    res.json({
      status: true,
      carriers: data,
      totalDocuments : totalDocuments,
      page : page,
      per_page : limit,
      totalPages : totalPages,
      message: data.length ? undefined : "No files found"
    });
});

exports.deleteCarrier = catchAsync(async (req, res) => {
    try {
      const carrier = await Carrier.findById(req.params.id);
      if (!carrier) {
        return res.status(404).json({
          status: false,
          error: 'Carrier not found.',
        });
      }
      
      carrier.deletedAt = Date.now();
      const result = await carrier.save();
      if (result) {
        return res.status(200).json({
          status: true,
          message: `Carrier has been removed.`,
          carrier: result,
        });
      } else {
        return res.status(400).json({
          status: false,
          carrier: null,
          error: 'Something went wrong in removing the carrier. Please try again.',
        });
      }
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
      error: error
    });
  }
});

exports.updateCarrier = catchAsync(async (req, res, next) => {
  try { 
    const { mc_code,  name, phone, email, location, country, state, city, zipcode, secondary_email, secondary_phone } = req.body;
    if (mc_code) {
      const existingCarrier = await Carrier.findOne({ mc_code: mc_code, _id: {$ne: req.params.id }});
      if (existingCarrier) {
        return res.status(200).send({
          status: false,
          message: "MC Code must be unique. This MC Code is already in use.",
        });
      }
    }
    const updatedUser = await Carrier.findByIdAndUpdate(req.params.id, {
        name: name,
        email: email,
        location: location,
        phone: phone,
        country: country,
        state: state,
        city: city,
        zipcode: zipcode,
        mc_code: mc_code,
        secondary_email: secondary_email,
        secondary_phone: secondary_phone
      },{
      new: true, 
      runValidators: true,
    });
    if(!updatedUser){ 
      res.send({
        status: false,
        carrier : updatedUser,
        message: "Failed to update carrier information.",
      });
    } 
    res.send({
      status: true,
      error :updatedUser,
      message: "Carrier has been updated.",
    });
  } catch (error) {
    res.send({
      status: false,
      error :error,
      message: "Failed to update carrier information.",
    });
  }
});

exports.carrierDetail = catchAsync(async (req, res, next) => {
  const c = await Carrier.findById(req.params.id);
  if(!c){ 
    res.send({
      status: false,
      result : null,
      message: "Carrier not found",
    });
  } 
  res.send({
    status: true,
    result : c,
    message: "Carrier has been updated.",
  });
});

exports.getDistance = async (req, res) => {
    
  const apiKey = process.env.GOOGLE_API_KEY;
  const locations = req.body.locations

  if (!locations || locations.length <= 1) {
    return res.status(200).json({ 
      status: false,
      msg: "At least 2 locations are required."
     });
  }
  const origin = locations[0];
  const destination = locations[locations?.length - 1];
  const waypoints = locations.slice(1, -1); 
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}${
    waypoints.length ? `&waypoints=optimize:true|${waypoints.map(encodeURIComponent).join("|")}` : "" }&key=${apiKey}`;

    console.log("url",url)
  try {
    const response = await axios.get(url);
    console.log("response?.data", response);
    if (response?.data?.routes.length === 0 || response?.data?.status !== "OK") {
      return res.status(200).json({
        status: false,
        msg: response?.data?.error_message || "No route found between given locations.",
      });
    }
    const legs = response?.data?.routes[0]?.legs;
    
    let totalDistance = 0;
    let totalDuration = 0;

    if(response?.data?.error_message){
      res.json({
        status:false,
        msg:response?.data?.error_message,
      })
    }
    console.log("legs",legs)
    if(legs){
      legs.forEach((leg) => {
        totalDistance += leg?.distance?.value; 
        totalDuration += leg?.duration?.value;
      });
    }
    

    const totalKM = (totalDistance / 1000).toFixed(2);
    const totalDistanceMiles = (totalKM / 1609.34).toFixed(2);

    res.json({
      status:true,
      msg:"Distance calculated successfully",
      origin,
      destination,
      waypoints,
      locations,
      totalKm: totalKM,
      totalMiles: totalDistanceMiles,
      totalDurationMin: Math.round(totalDuration / 60),
    });
  } catch (error) {
    console.log("Directions API Error:", error.response?.data || error.message);
    // res.status(200).json({ error: "Failed to fetch route info" });
  }
};