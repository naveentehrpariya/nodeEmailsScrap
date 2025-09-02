const express = require('express');
const UserMapping = require('../db/UserMapping');
const { resolveUnmappedUsers } = require('../scripts/resolveUnmappedUsers');
const router = express.Router();

// Get all user mappings with pagination
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search, 
            resolvedBy,
            minConfidence,
            domain,
            sortBy = 'lastSeen',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (search) {
            query.$or = [
                { displayName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { userId: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (resolvedBy) {
            query.resolvedBy = resolvedBy;
        }
        
        if (minConfidence) {
            query.confidence = { $gte: parseInt(minConfidence) };
        }
        
        if (domain) {
            query.domain = domain;
        }
        
        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        
        const userMappings = await UserMapping.find(query)
            .populate('discoveredByAccount', 'email')
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit);
        
        const total = await UserMapping.countDocuments(query);
        
        res.json({
            success: true,
            data: {
                userMappings,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total,
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching user mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user mappings'
        });
    }
});

// Get a specific user mapping by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const userMapping = await UserMapping.findById(id)
            .populate('discoveredByAccount', 'email');
        
        if (!userMapping) {
            return res.status(404).json({
                success: false,
                error: 'User mapping not found'
            });
        }
        
        res.json({
            success: true,
            data: userMapping
        });
    } catch (error) {
        console.error('Error fetching user mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user mapping'
        });
    }
});

// Get user mapping by userId
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userMapping = await UserMapping.getUserInfo(userId);
        
        if (!userMapping) {
            return res.status(404).json({
                success: false,
                error: 'User mapping not found'
            });
        }
        
        res.json({
            success: true,
            data: userMapping
        });
    } catch (error) {
        console.error('Error fetching user mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user mapping'
        });
    }
});

// Create or update a user mapping
router.post('/', async (req, res) => {
    try {
        const {
            userId,
            displayName,
            email,
            domain,
            resolvedBy,
            discoveredByAccount,
            confidence,
            originalUserResourceName
        } = req.body;
        
        if (!userId || !displayName || !email) {
            return res.status(400).json({
                success: false,
                error: 'userId, displayName, and email are required'
            });
        }
        
        const userMapping = await UserMapping.findOrCreateUser({
            userId,
            displayName,
            email,
            domain: domain || email.split('@')[1],
            resolvedBy: resolvedBy || 'manual',
            discoveredByAccount,
            confidence: confidence || 100,
            originalUserResourceName
        });
        
        res.status(201).json({
            success: true,
            message: 'User mapping created/updated successfully',
            data: userMapping
        });
    } catch (error) {
        console.error('Error creating/updating user mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create/update user mapping'
        });
    }
});

// Update a user mapping
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        // Remove fields that shouldn't be updated directly
        delete updateData._id;
        delete updateData.createdAt;
        delete updateData.seenCount;
        
        const userMapping = await UserMapping.findByIdAndUpdate(
            id,
            { ...updateData, updatedAt: new Date() },
            { new: true, runValidators: true }
        );
        
        if (!userMapping) {
            return res.status(404).json({
                success: false,
                error: 'User mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'User mapping updated successfully',
            data: userMapping
        });
    } catch (error) {
        console.error('Error updating user mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user mapping'
        });
    }
});

// Delete a user mapping
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const userMapping = await UserMapping.findByIdAndDelete(id);
        
        if (!userMapping) {
            return res.status(404).json({
                success: false,
                error: 'User mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'User mapping deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user mapping'
        });
    }
});

// Get user mapping statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const stats = await UserMapping.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    byResolvedBy: {
                        $push: {
                            resolvedBy: '$resolvedBy',
                            confidence: '$confidence'
                        }
                    },
                    avgConfidence: { $avg: '$confidence' },
                    totalSeen: { $sum: '$seenCount' }
                }
            },
            {
                $project: {
                    _id: 0,
                    total: 1,
                    avgConfidence: { $round: ['$avgConfidence', 2] },
                    totalSeen: 1,
                    byResolvedBy: 1
                }
            }
        ]);
        
        // Get breakdown by resolution method
        const resolutionStats = await UserMapping.aggregate([
            {
                $group: {
                    _id: '$resolvedBy',
                    count: { $sum: 1 },
                    avgConfidence: { $avg: '$confidence' },
                    totalSeen: { $sum: '$seenCount' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Get domain breakdown
        const domainStats = await UserMapping.aggregate([
            {
                $group: {
                    _id: '$domain',
                    count: { $sum: 1 },
                    avgConfidence: { $avg: '$confidence' }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);
        
        // Get confidence distribution
        const confidenceDistribution = await UserMapping.aggregate([
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$confidence', 90] }, then: '90-100' },
                                { case: { $gte: ['$confidence', 70] }, then: '70-89' },
                                { case: { $gte: ['$confidence', 50] }, then: '50-69' },
                                { case: { $gte: ['$confidence', 30] }, then: '30-49' }
                            ],
                            default: '0-29'
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);
        
        res.json({
            success: true,
            data: {
                overview: stats[0] || { 
                    total: 0, 
                    avgConfidence: 0, 
                    totalSeen: 0 
                },
                byResolutionMethod: resolutionStats,
                byDomain: domainStats,
                confidenceDistribution
            }
        });
    } catch (error) {
        console.error('Error fetching user mapping statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user mapping statistics'
        });
    }
});

// Search for similar users (for deduplication)
router.get('/similar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const userMapping = await UserMapping.findById(id);
        if (!userMapping) {
            return res.status(404).json({
                success: false,
                error: 'User mapping not found'
            });
        }
        
        // Find similar users based on email, displayName, or userId
        const similar = await UserMapping.find({
            _id: { $ne: id },
            $or: [
                { email: userMapping.email },
                { displayName: userMapping.displayName },
                { 
                    displayName: { 
                        $regex: userMapping.displayName.split(' ')[0], 
                        $options: 'i' 
                    } 
                }
            ]
        }).limit(10);
        
        res.json({
            success: true,
            data: {
                original: userMapping,
                similar
            }
        });
    } catch (error) {
        console.error('Error finding similar user mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find similar user mappings'
        });
    }
});

// Merge user mappings (for deduplication)
router.post('/merge', async (req, res) => {
    try {
        const { primaryId, duplicateIds } = req.body;
        
        if (!primaryId || !duplicateIds || !Array.isArray(duplicateIds)) {
            return res.status(400).json({
                success: false,
                error: 'primaryId and duplicateIds array are required'
            });
        }
        
        const primary = await UserMapping.findById(primaryId);
        if (!primary) {
            return res.status(404).json({
                success: false,
                error: 'Primary user mapping not found'
            });
        }
        
        // Get all duplicate mappings
        const duplicates = await UserMapping.find({ _id: { $in: duplicateIds } });
        
        // Merge seen counts and update confidence if higher
        let totalSeenCount = primary.seenCount;
        let highestConfidence = primary.confidence;
        let bestResolvedBy = primary.resolvedBy;
        
        for (const duplicate of duplicates) {
            totalSeenCount += duplicate.seenCount;
            if (duplicate.confidence > highestConfidence) {
                highestConfidence = duplicate.confidence;
                bestResolvedBy = duplicate.resolvedBy;
            }
        }
        
        // Update primary with merged data
        await UserMapping.findByIdAndUpdate(primaryId, {
            seenCount: totalSeenCount,
            confidence: highestConfidence,
            resolvedBy: bestResolvedBy,
            lastSeen: new Date(),
            updatedAt: new Date()
        });
        
        // Delete duplicates
        await UserMapping.deleteMany({ _id: { $in: duplicateIds } });
        
        res.json({
            success: true,
            message: `Merged ${duplicateIds.length} duplicate mappings into primary mapping`,
            data: {
                primaryId,
                mergedCount: duplicateIds.length,
                newSeenCount: totalSeenCount
            }
        });
    } catch (error) {
        console.error('Error merging user mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to merge user mappings'
        });
    }
});

// Bulk update user mappings
router.patch('/bulk', async (req, res) => {
    try {
        const { ids, updates } = req.body;
        
        if (!ids || !Array.isArray(ids) || !updates) {
            return res.status(400).json({
                success: false,
                error: 'ids array and updates object are required'
            });
        }
        
        const result = await UserMapping.updateMany(
            { _id: { $in: ids } },
            { ...updates, updatedAt: new Date() }
        );
        
        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} user mappings`,
            data: {
                matched: result.matchedCount,
                modified: result.modifiedCount
            }
        });
    } catch (error) {
        console.error('Error bulk updating user mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk update user mappings'
        });
    }
});

// Resolve unmapped users via Google Directory API
router.post('/resolve', async (req, res) => {
    try {
        const { userIds = null, force = false } = req.body;
        
        console.log('🔧 Manual user resolution triggered via API', { 
            userIds: userIds?.length || 'all', 
            force 
        });
        
        // Options for the resolution script
        const options = {
            specificUserIds: userIds,
            force: force,
            dryRun: false
        };
        
        // Run the resolution process
        const result = await resolveUnmappedUsers(options);
        
        res.json({
            success: true,
            message: 'User resolution completed successfully',
            data: {
                summary: {
                    resolved: result.resolvedCount,
                    failed: result.failedCount,
                    skipped: result.skippedCount,
                    messagesUpdated: result.updatedMessagesCount
                },
                successRate: result.resolvedCount + result.failedCount > 0 
                    ? ((result.resolvedCount / (result.resolvedCount + result.failedCount)) * 100).toFixed(1) + '%'
                    : '0.0%'
            }
        });
        
    } catch (error) {
        console.error('Error resolving unmapped users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resolve unmapped users',
            message: error.message
        });
    }
});

module.exports = router;
