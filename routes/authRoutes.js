const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateToken } = require('../controllers/authController');

router.route('/create_user').post(validateToken, authController.signup);
router.route('/login').post(authController.login); 
router.route('/logout').get(validateToken, authController.logout);

module.exports = router;