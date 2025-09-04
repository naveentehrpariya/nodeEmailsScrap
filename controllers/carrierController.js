const Carrier = require("../db/Carrier");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const JSONerror = require("../utils/jsonErrorHandler");
const logger = console.log; // Replace with your actual logger
const { prepareEmailsForStorage, getPrimaryEmail, getAllEmails } = require("../utils/carrierEmailUtils");

/**
 * Add a new carrier
 */
exports.addCarrier = catchAsync(async (req, res, next) => {
    const { 
        name, 
        phone, 
        email, 
        emails, 
        location, 
        country, 
        state, 
        city, 
        zipcode, 
        secondary_email, 
        secondary_phone, 
        mc_code 
    } = req.body;

    if (!name || !mc_code) {
        return next(new AppError('Carrier name and MC Code are required', 400));
    }

    try {
        // Check for duplicate MC Code
        const existingCarrier = await Carrier.findOne({ mc_code });
        if (existingCarrier) {
            return next(new AppError(`MC code ${mc_code} already exists. Please use a different MC code.`, 400));
        }

        // Generate unique carrier ID
        let carrierID;
        let isUnique = false;
        while (!isUnique) {
            carrierID = `CR_ID${Math.floor(100000 + Math.random() * 900000)}`;
            const existingUser = await Carrier.findOne({ carrierID });
            if (!existingUser) {
                isUnique = true;
            }
        }

        // Process emails array using utility function
        const emailsArray = prepareEmailsForStorage(emails, email, secondary_email);

        if (emailsArray.length === 0) {
            return next(new AppError('At least one email address is required', 400));
        }

        await Carrier.syncIndexes();
        
        const newCarrier = await Carrier.create({
            name: name,
            email: email,
            secondary_email: secondary_email,
            secondary_phone: secondary_phone,
            emails: emailsArray,
            location: location,
            phone: phone,
            carrierID: carrierID,
            country: country,
            state: state,
            city: city,
            zipcode: zipcode,
            mc_code: mc_code,
            created_by: req.user ? req.user._id : null,
            company: req.user && req.user.company ? req.user.company._id : null
        });

        res.status(201).json({
            status: true,
            carrier: newCarrier,
            message: "Carrier has been added successfully.",
        });

    } catch (err) {
        JSONerror(res, err, next);
        logger(err);
    }
});

/**
 * Get all carriers with search and pagination
 */
exports.getAllCarriers = catchAsync(async (req, res, next) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        
        // Build base filter for non-deleted carriers
        let filter = { deletedAt: { $exists: false } };
        
        // Add search functionality
        if (search && search.trim().length > 0) {
            const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const isNumber = !isNaN(search);
            
            if (isNumber) {
                // Search by MC code if search term is numeric
                filter.mc_code = { $regex: new RegExp(safeSearch, 'i') };
            } else {
                // Search by name or email if search term is text
                filter.$or = [
                    { name: { $regex: new RegExp(safeSearch, 'i') } },
                    { email: { $regex: new RegExp(safeSearch, 'i') } },
                    { secondary_email: { $regex: new RegExp(safeSearch, 'i') } },
                    { 'emails.email': { $regex: new RegExp(safeSearch, 'i') } }
                ];
            }
        }
        
        // Calculate pagination
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;
        
        // Get total count for pagination
        const totalDocuments = await Carrier.countDocuments(filter);
        const totalPages = Math.ceil(totalDocuments / limitNumber);
        
        // Fetch carriers with pagination
        const carriers = await Carrier.find(filter)
            .populate('created_by', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .lean();
        
        res.status(200).json({
            status: true,
            carriers: carriers,
            totalDocuments: totalDocuments,
            page: pageNumber,
            per_page: limitNumber,
            totalPages: totalPages,
            message: carriers.length ? undefined : "No carriers found",
            ...(search && {
                meta: {
                    searchTerm: search,
                    isFiltered: true
                }
            })
        });
        
    } catch (err) {
        return next(new AppError("Failed to fetch carriers", 500));
    }
});

/**
 * Get single carrier by ID
 */
exports.getCarrier = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    
    try {
        const carrier = await Carrier.findOne({ 
            _id: id, 
            deletedAt: { $exists: false } 
        })
        .populate('created_by', 'name email')
        .lean();
        
        if (!carrier) {
            return next(new AppError("Carrier not found", 404));
        }
        
        res.status(200).json({
            status: true,
            message: "Carrier fetched successfully",
            carrier: carrier
        });
        
    } catch (err) {
        return next(new AppError("Failed to fetch carrier", 500));
    }
});

/**
 * Update carrier information
 */
exports.updateCarrier = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { 
        mc_code, 
        name, 
        phone, 
        email, 
        emails, 
        location, 
        country, 
        state, 
        city, 
        zipcode, 
        secondary_email, 
        secondary_phone 
    } = req.body;
    
    try {
        // Check if carrier exists
        const existingCarrier = await Carrier.findOne({ 
            _id: id, 
            deletedAt: { $exists: false } 
        });
        
        if (!existingCarrier) {
            return next(new AppError("Carrier not found", 404));
        }
        
        // Check for duplicate MC Code (excluding current carrier)
        if (mc_code) {
            const duplicateMC = await Carrier.findOne({ 
                mc_code: mc_code, 
                _id: { $ne: id },
                deletedAt: { $exists: false }
            });
            
            if (duplicateMC) {
                return next(new AppError("MC Code must be unique. This MC Code is already in use.", 400));
            }
        }

        // Process emails array using utility function
        const emailsArray = prepareEmailsForStorage(emails, email, secondary_email);

        // Build update object
        const updateData = {
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
            secondary_phone: secondary_phone,
            updatedAt: new Date()
        };

        // Include emails array if it was processed
        if (emailsArray.length > 0) {
            updateData.emails = emailsArray;
        }

        const updatedCarrier = await Carrier.findByIdAndUpdate(
            id, 
            updateData, 
            {
                new: true, 
                runValidators: true,
            }
        ).populate('created_by', 'name email');
        
        if (!updatedCarrier) {
            return next(new AppError("Failed to update carrier information", 500));
        }
        
        res.status(200).json({
            status: true,
            carrier: updatedCarrier,
            message: "Carrier has been updated successfully.",
        });
        
    } catch (err) {
        return next(new AppError("Failed to update carrier information", 500));
    }
});

/**
 * Delete carrier (soft delete)
 */
exports.deleteCarrier = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    
    try {
        const carrier = await Carrier.findOne({ 
            _id: id, 
            deletedAt: { $exists: false } 
        });
        
        if (!carrier) {
            return next(new AppError('Carrier not found', 404));
        }
        
        // Soft delete
        carrier.deletedAt = new Date();
        const result = await carrier.save();
        
        if (result) {
            res.status(200).json({
                status: true,
                message: 'Carrier has been removed successfully.',
                carrier: result,
            });
        } else {
            return next(new AppError('Something went wrong while removing the carrier. Please try again.', 500));
        }
        
    } catch (error) {
        return next(new AppError('Failed to delete carrier', 500));
    }
});

/**
 * Search carriers by email address
 */
exports.findCarrierByEmail = catchAsync(async (req, res, next) => {
    const { email } = req.params;
    
    if (!email) {
        return next(new AppError('Email address is required', 400));
    }
    
    try {
        const carrier = await Carrier.findByEmail(email);
        
        if (!carrier) {
            return res.status(200).json({
                status: false,
                message: 'No carrier found with this email address',
                carrier: null
            });
        }
        
        res.status(200).json({
            status: true,
            message: 'Carrier found',
            carrier: carrier
        });
        
    } catch (err) {
        return next(new AppError('Failed to search for carrier', 500));
    }
});

/**
 * Get carrier email history/details
 */
exports.getCarrierEmails = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    
    try {
        const carrier = await Carrier.findOne({ 
            _id: id, 
            deletedAt: { $exists: false } 
        }).lean();
        
        if (!carrier) {
            return next(new AppError("Carrier not found", 404));
        }
        
        const allEmails = getAllEmails(carrier);
        const primaryEmail = getPrimaryEmail(carrier);
        
        res.status(200).json({
            status: true,
            message: "Carrier emails fetched successfully",
            data: {
                carrierName: carrier.name,
                mcCode: carrier.mc_code,
                primaryEmail: primaryEmail,
                allEmails: allEmails,
                totalEmails: allEmails.length
            }
        });
        
    } catch (err) {
        return next(new AppError("Failed to fetch carrier emails", 500));
    }
});
