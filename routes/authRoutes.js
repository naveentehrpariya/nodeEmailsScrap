const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateToken } = require('../controllers/authController');

router.route('/create_user').post(validateToken, authController.signup);
router.route('/edit_user/:id').post(validateToken, authController.editUser);
router.route('/suspanduser/:id').get(validateToken, authController.suspandUser);
router.route('/login').post(authController.login); 
router.route('/forgotpassword').post(authController.forgotPassword); 
router.route('/resetpassword/:token').patch(authController.resetpassword); 
router.route('/profile').get(validateToken, authController.profile);
router.route('/employeesLisiting').get(validateToken, authController.employeesLisiting);
router.route('/employee/docs/:id').get(validateToken, authController.employeesDocs);
router.route('/add-company-information').post(validateToken, authController.addCompanyInfo);
router.route('/change-password').post(validateToken, authController.changePassword);
router.route('/logout').get(validateToken, authController.logout);

module.exports = router;