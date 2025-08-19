const express = require('express');
const mongoose = require('mongoose');
const Chat = require('../db/Chat');
const Account = require('../db/Account');
const chatSyncService = require('../services/optimizedChatSyncService');
const originalChatSyncService = require('../services/chatSyncService');
const chatSyncScheduler = require('../services/chatSyncScheduler');
const router = express.Router();

// Get all chats (for testing/debugging)
router.get('/list', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const chats = await Chat.find({})
            .sort({ lastMessageTime: -1 })
            .limit(parseInt(limit));
        
        res.json(chats);
    } catch (error) {
        console.error('Error fetching chat list:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat'
        });
    }
});

// Get all chats for a specific account
router.get('/account/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { page = 1, limit = 10, search } = req.query;
        
        // Build query - convert accountId string to ObjectId
        const query = { account: new mongoose.Types.ObjectId(accountId) };
        if (search) {
            query.$or = [
                { displayName: { $regex: search, $options: 'i' } },
                { 'messages.text': { $regex: search, $options: 'i' } }
            ];
        }
        
        const chats = await Chat.find(query)
            .populate('account', 'email name')
            .sort({ lastMessageTime: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        
        const total = await Chat.countDocuments(query);
        
        res.json({
            success: true,
            data: {
                chats,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total,
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chats'
        });
    }
});

// Get a specific chat by ID
router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        
        const chat = await Chat.findById(chatId)
            .populate('account', 'email name');
        
        if (!chat) {
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        res.json({
            success: true,
            data: chat
        });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat'
        });
    }
});

// Get messages for a specific chat
router.get('/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        // Get messages with pagination
        const messages = chat.messages
            .sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
            .slice((page - 1) * limit, page * limit);
        
        res.json({
            success: true,
            data: {
                messages,
                chatInfo: {
                    id: chat._id,
                    displayName: chat.displayName,
                    spaceType: chat.spaceType,
                    messageCount: chat.messageCount
                },
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(chat.messages.length / limit),
                    total: chat.messages.length,
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat messages'
        });
    }
});

// Sync chats for a specific account
router.post('/sync/account/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const account = await Account.findById(accountId);
        if (!account) {
            return res.status(404).json({
                success: false,
                error: 'Account not found'
            });
        }
        
        console.log(`🔄 Starting manual chat sync for account: ${account.email}`);
        const result = await chatSyncService.syncAccountChats(account);
        
        res.json({
            success: true,
            message: `Chat sync completed for ${account.email}`,
            data: result
        });
    } catch (error) {
        console.error('Error syncing account chats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync account chats'
        });
    }
});

// Sync chats for all accounts using optimized service
router.post('/sync/all', async (req, res) => {
    try {
        console.log('🔄 Starting manual chat sync for all accounts using optimized service');
        const results = await chatSyncService.syncAllChats();
        
        res.json({
            success: true,
            message: 'Chat sync completed for all accounts (optimized)',
            data: results
        });
    } catch (error) {
        console.error('Error syncing all chats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync all chats'
        });
    }
});

// Original sync (slower) for comparison - use /sync/all/original
router.post('/sync/all/original', async (req, res) => {
    try {
        console.log('🔄 Starting manual chat sync for all accounts using original service');
        const results = await originalChatSyncService.syncAllAccountChats();
        
        res.json({
            success: true,
            message: 'Chat sync completed for all accounts (original)',
            data: results
        });
    } catch (error) {
        console.error('Error syncing all chats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync all chats'
        });
    }
});

// Get chat sync statistics
router.get('/sync/stats', async (req, res) => {
    try {
        const totalChats = await Chat.countDocuments();
        const totalMessages = await Chat.aggregate([
            { $group: { _id: null, total: { $sum: '$messageCount' } } }
        ]);
        
        const accountStats = await Chat.aggregate([
            {
                $group: {
                    _id: '$account',
                    chatCount: { $sum: 1 },
                    messageCount: { $sum: '$messageCount' },
                    lastSync: { $max: '$updatedAt' }
                }
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'account'
                }
            },
            {
                $unwind: '$account'
            },
            {
                $project: {
                    accountId: '$_id',
                    email: '$account.email',
                    chatCount: 1,
                    messageCount: 1,
                    lastSync: 1
                }
            }
        ]);
        
        res.json({
            success: true,
            data: {
                overview: {
                    totalChats,
                    totalMessages: totalMessages[0]?.total || 0
                },
                byAccount: accountStats
            }
        });
    } catch (error) {
        console.error('Error fetching sync stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sync statistics'
        });
    }
});

// Chat scheduler routes
router.post('/sync/scheduler/start', async (req, res) => {
    try {
        await chatSyncScheduler.start();
        res.json({
            success: true,
            message: 'Chat sync scheduler started'
        });
    } catch (error) {
        console.error('Error starting scheduler:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start chat sync scheduler'
        });
    }
});

router.post('/sync/scheduler/stop', async (req, res) => {
    try {
        await chatSyncScheduler.stop();
        res.json({
            success: true,
            message: 'Chat sync scheduler stopped'
        });
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop chat sync scheduler'
        });
    }
});

router.post('/sync/scheduler/trigger', async (req, res) => {
    try {
        const result = await chatSyncScheduler.triggerManualSync();
        res.json({
            success: true,
            message: 'Manual sync triggered',
            data: result
        });
    } catch (error) {
        console.error('Error triggering manual sync:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger manual sync'
        });
    }
});

router.get('/sync/scheduler/status', async (req, res) => {
    try {
        const status = await chatSyncScheduler.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error fetching scheduler status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scheduler status'
        });
    }
});

// Search across all chats
router.get('/search', async (req, res) => {
    try {
        const { q, accountId, limit = 20 } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }
        
        const query = {
            $or: [
                { displayName: { $regex: q, $options: 'i' } },
                { 'messages.text': { $regex: q, $options: 'i' } },
                { 'messages.senderDisplayName': { $regex: q, $options: 'i' } }
            ]
        };
        
        if (accountId) {
            query.account = accountId;
        }
        
        const chats = await Chat.find(query)
            .populate('account', 'email name')
            .limit(parseInt(limit))
            .sort({ lastMessageTime: -1 });
        
        // Also search within messages and return matching messages
        const messageMatches = [];
        for (const chat of chats) {
            const matchingMessages = chat.messages.filter(msg => 
                msg.text.toLowerCase().includes(q.toLowerCase()) ||
                msg.senderDisplayName.toLowerCase().includes(q.toLowerCase())
            );
            
            if (matchingMessages.length > 0) {
                messageMatches.push({
                    chat: {
                        id: chat._id,
                        displayName: chat.displayName,
                        spaceType: chat.spaceType
                    },
                    messages: matchingMessages.slice(0, 3) // Limit to 3 matches per chat
                });
            }
        }
        
        res.json({
            success: true,
            data: {
                chats,
                messageMatches,
                query: q,
                resultCount: chats.length
            }
        });
    } catch (error) {
        console.error('Error searching chats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search chats'
        });
    }
});

// Get chat analytics
router.get('/analytics', async (req, res) => {
    try {
        const { accountId, days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        const matchStage = accountId ? { account: accountId } : {};
        
        const analytics = await Chat.aggregate([
            { $match: matchStage },
            {
                $project: {
                    account: 1,
                    spaceType: 1,
                    messageCount: 1,
                    recentMessages: {
                        $filter: {
                            input: '$messages',
                            cond: { $gte: ['$$this.createTime', startDate] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: {
                        account: '$account',
                        spaceType: '$spaceType'
                    },
                    chatCount: { $sum: 1 },
                    totalMessages: { $sum: '$messageCount' },
                    recentMessages: { $sum: { $size: '$recentMessages' } }
                }
            },
            {
                $group: {
                    _id: '$_id.account',
                    stats: {
                        $push: {
                            spaceType: '$_id.spaceType',
                            chatCount: '$chatCount',
                            totalMessages: '$totalMessages',
                            recentMessages: '$recentMessages'
                        }
                    },
                    totalChats: { $sum: '$chatCount' },
                    totalMessages: { $sum: '$totalMessages' },
                    totalRecentMessages: { $sum: '$recentMessages' }
                }
            },
            {
                $lookup: {
                    from: 'accounts',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'account'
                }
            }
        ]);
        
        res.json({
            success: true,
            data: {
                period: `Last ${days} days`,
                analytics
            }
        });
    } catch (error) {
        console.error('Error fetching chat analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat analytics'
        });
    }
});

module.exports = router;
