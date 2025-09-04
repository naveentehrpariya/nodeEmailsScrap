const express = require('express');
const router = express.Router();
const { validateToken } = require('../controllers/authController');
const {
    addCarrier,
    getAllCarriers,
    getCarrier,
    updateCarrier,
    deleteCarrier,
    findCarrierByEmail,
    getCarrierEmails
} = require('../controllers/carrierController');

/**
 * Carrier CRUD Routes
 */

// POST /api/carriers - Add new carrier
router.route('/carriers').post(validateToken, addCarrier);

// GET /api/carriers - Get all carriers with search and pagination
// Query parameters: ?search={term}&page={page}&limit={limit}
// Search supports MC Code (numeric), name, or email
router.route('/carriers').get(validateToken, getAllCarriers);

// GET /api/carriers/:id - Get single carrier by ID
router.route('/carriers/:id').get(validateToken, getCarrier);

// PUT /api/carriers/:id - Update carrier information
router.route('/carriers/:id').put(validateToken, updateCarrier);

// DELETE /api/carriers/:id - Soft delete carrier
router.route('/carriers/:id').delete(validateToken, deleteCarrier);

/**
 * Carrier Email Management Routes
 */

// GET /api/carriers/:id/emails - Get all emails for a specific carrier
router.route('/carriers/:id/emails').get(validateToken, getCarrierEmails);

// GET /api/carriers/search/email/:email - Find carrier by email address
// This searches across all email fields (primary, secondary, and emails array)
router.route('/carriers/search/email/:email').get(validateToken, findCarrierByEmail);

/**
 * Test Routes (for development - no authentication required)
 * Remove these in production or add proper authentication
 */

// Test routes without auth
router.route('/test/carriers').post(addCarrier);
router.route('/test/carriers').get(getAllCarriers);
router.route('/test/carriers/:id').get(getCarrier);
router.route('/test/carriers/:id').put(updateCarrier);
router.route('/test/carriers/:id').delete(deleteCarrier);
router.route('/test/carriers/:id/emails').get(getCarrierEmails);
router.route('/test/carriers/search/email/:email').get(findCarrierByEmail);

module.exports = router;
