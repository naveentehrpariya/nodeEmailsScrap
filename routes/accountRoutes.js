const express = require('express');
const router = express.Router();
const { validateToken } = require('../controllers/authController');
const { addNewAccount } = require('../controllers/emailController');

router.route('/account/add').post(validateToken, addNewAccount);

module.exports = router;