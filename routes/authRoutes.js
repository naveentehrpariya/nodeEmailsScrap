const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateToken } = require('../controllers/authController');

router.route('/create_user').get( authController.signup);
router.route('/login').post(authController.login); 
router.route('/logout').get(validateToken, authController.logout);
router.route('/profile').get(validateToken, authController.profile);

// Profile management routes
router.route('/profile/update').put(validateToken, authController.updateProfile);
router.route('/profile/change-password').put(validateToken, authController.changePassword);

module.exports = router;
