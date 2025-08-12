const express = require('express');
const router = express.Router();
const { validateToken } = require('../controllers/authController');
const { 
    addNewAccount, 
    getAllAccounts, 
    getAccount, 
    editAccount, 
    deleteAccount,
    syncAccount,
    syncAllAccounts,
    getSchedulerStatus,
    toggleScheduler,
    getAccountThreads,
    getSingleThread,
    downloadAttachment
} = require('../controllers/emailController');

// Account routes
router.route('/account/add').post(validateToken, addNewAccount);
router.route('/accounts').get(validateToken, getAllAccounts);
router.route('/account/:id').get(validateToken, getAccount);
router.route('/account/:id').put(validateToken, editAccount);
router.route('/account/:id').delete(validateToken, deleteAccount);

// Sync routes
router.route('/account/:id/sync').post(validateToken, syncAccount);
router.route('/accounts/sync').post(validateToken, syncAllAccounts);

// Thread routes
router.route('/account/:accountId/threads').get(validateToken, getAccountThreads);
router.route('/thread/:threadId').get(validateToken, getSingleThread);

// Attachment routes
router.route('/attachment/:id/download').get(validateToken, downloadAttachment);

// Scheduler routes
router.route('/scheduler/status').get(validateToken, getSchedulerStatus);
router.route('/scheduler/toggle').post(validateToken, toggleScheduler);

module.exports = router;
