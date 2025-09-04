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
    triggerScheduledSync,
    getAccountThreads,
    getSingleThread,
    downloadAttachment,
    clearAllEmails
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
// Temporarily disabled auth for testing
router.route('/account/:accountEmail/chats').get(ChatController.getAccountChats);
router.route('/account/:accountEmail/chats/:chatId/messages').get(ChatController.getChatMessages);
router.route('/account/:accountEmail/sync-chats').post(ChatController.syncChats);

// Test routes without auth (for development)
router.route('/test/account/:accountEmail/chats').get(ChatController.getAccountChats);
router.route('/test/account/:accountEmail/chats/:chatId/messages').get(ChatController.getChatMessages);
router.route('/test/account/:accountEmail/sync-chats').post(ChatController.syncChats);
router.route('/test/thread/:threadId').get(getSingleThread);

// User mappings routes
router.route('/user-mappings').get(validateToken, ChatController.getUserMappings);
router.route('/user-mappings/:userId').get(validateToken, ChatController.getUserMapping);

// Chat scheduler routes
router.route('/chat-sync/status').get(validateToken, ChatController.getChatSyncStatus);
router.route('/chat-sync/start').post(validateToken, ChatController.startChatSync);
router.route('/chat-sync/stop').post(validateToken, ChatController.stopChatSync);
router.route('/chat-sync/run').post(validateToken, ChatController.runChatSyncNow);

// Workspace user sync routes
router.route('/workspace/users/sync').post(validateToken, ChatController.syncWorkspaceUsers);
router.route('/workspace/users').get(validateToken, ChatController.getWorkspaceUsers);
router.route('/workspace/users/search/:query').get(validateToken, ChatController.searchWorkspaceUser);

// Test routes for workspace users (no auth required)
router.route('/test/workspace/users/sync').post(ChatController.syncWorkspaceUsers);
router.route('/test/workspace/users').get(ChatController.getWorkspaceUsers);
router.route('/test/workspace/users/search/:query').get(ChatController.searchWorkspaceUser);

// UserMapping linking routes
router.route('/link-chats-to-users').post(validateToken, ChatController.linkChatsToUserMappings);
router.route('/account/:accountEmail/chats-with-populate').get(validateToken, ChatController.getAccountChatsWithPopulate);

// Test routes for UserMapping linking (no auth required)
router.route('/test/link-chats-to-users').post(ChatController.linkChatsToUserMappings);
router.route('/test/account/:accountEmail/chats-with-populate').get(ChatController.getAccountChatsWithPopulate);

// Debug routes (no auth required for testing)
router.route('/test/debug/account/:accountEmail/chat-data').get(ChatController.debugChatData);

// Participant fix routes
router.route('/fix-incomplete-participants').post(validateToken, ChatController.fixIncompleteParticipants);
router.route('/test/fix-incomplete-participants').post(ChatController.fixIncompleteParticipants);

// Scheduler routes
router.route('/scheduler/status').get(validateToken, getSchedulerStatus);
router.route('/scheduler/toggle').post(validateToken, toggleScheduler);
router.route('/scheduler/trigger').post(validateToken, triggerScheduledSync);

// Clear all data routes
router.route('/account/:accountEmail/clear-all-emails').delete(validateToken, clearAllEmails);
router.route('/account/:accountEmail/clear-all-chats').delete(validateToken, ChatController.clearAllChats);

// Test routes for clear all (no auth required)
router.route('/test/account/:accountEmail/clear-all-emails').delete(clearAllEmails);
router.route('/test/account/:accountEmail/clear-all-chats').delete(ChatController.clearAllChats);

// Test routes for scheduler (no auth required)
router.route('/test/scheduler/trigger').post(triggerScheduledSync);
router.route('/test/scheduler/status').get(getSchedulerStatus);

module.exports = router;
