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
const ChatController = require('../controllers/chatController');

// Account routes
router.route('/account/add').post(validateToken, addNewAccount);
// GET /accounts?search={term} - supports email search via query parameter
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

// Chat routes
router.route('/account/:accountEmail/chats').get(validateToken, ChatController.getAccountChats);
router.route('/account/:accountEmail/chats/:chatId/messages').get(validateToken, ChatController.getChatMessages);
router.route('/account/:accountEmail/sync-chats').post(validateToken, ChatController.syncChats);

// Test routes without auth (for development)
router.route('/test/account/:accountEmail/chats').get(ChatController.getAccountChats);
router.route('/test/account/:accountEmail/chats/:chatId/messages').get(ChatController.getChatMessages);

// User mappings routes
router.route('/user-mappings').get(validateToken, ChatController.getUserMappings);
router.route('/user-mappings/:userId').get(validateToken, ChatController.getUserMapping);

// Chat scheduler routes
router.route('/chat-sync/status').get(validateToken, ChatController.getChatSyncStatus);
router.route('/chat-sync/start').post(validateToken, ChatController.startChatSync);
router.route('/chat-sync/stop').post(validateToken, ChatController.stopChatSync);
router.route('/chat-sync/run').post(validateToken, ChatController.runChatSyncNow);

// Scheduler routes
router.route('/scheduler/status').get(validateToken, getSchedulerStatus);
router.route('/scheduler/toggle').post(validateToken, toggleScheduler);

module.exports = router;
