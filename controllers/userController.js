const UserMapping = require('../db/UserMapping');
const { resolveUnmappedUsers } = require('../scripts/resolveUnmappedUsers');

class UserController {
    
    // Manual user resolution endpoint
    static async resolveUsers(req, res) {
        try {
            const { userIds = null, force = false } = req.body;
            
            console.log('🔧 Manual user resolution triggered', { userIds: userIds?.length || 'all', force });
            
            // Options for the resolution script
            const options = {
                specificUserIds: userIds,
                force: force,
                dryRun: false
            };
            
            // Run the resolution process
            const result = await resolveUnmappedUsers(options);
            
            return res.json({
                status: true,
                message: 'User resolution completed',
                data: {
                    summary: {
                        resolved: result.resolvedCount,
                        failed: result.failedCount,
                        skipped: result.skippedCount,
                        messagesUpdated: result.updatedMessagesCount
                    },
                    successRate: result.resolvedCount + result.failedCount > 0 
                        ? ((result.resolvedCount / (result.resolvedCount + result.failedCount)) * 100).toFixed(1)
                        : '0.0'
                }
            });
            
        } catch (error) {
            console.error('Error resolving users:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to resolve users',
                error: error.message
            });
        }
    }
    
    // Get user mapping statistics
    static async getUserMappingStats(req, res) {
        try {
            const stats = await UserMapping.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        avgConfidence: { $avg: '$confidence' },
                        byResolvedBy: {
                            $push: {
                                resolvedBy: '$resolvedBy',
                                confidence: '$confidence'
                            }
                        }
                    }
                }
            ]);
            
            // Get breakdown by resolution method
            const methodStats = await UserMapping.aggregate([
                {
                    $group: {
                        _id: '$resolvedBy',
                        count: { $sum: 1 },
                        avgConfidence: { $avg: '$confidence' }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ]);
            
            // Get low confidence mappings count
            const lowConfidenceCount = await UserMapping.countDocuments({ 
                confidence: { $lt: 80 } 
            });
            
            // Get recent mappings
            const recentMappings = await UserMapping.find({})
                .sort({ createdAt: -1 })
                .limit(10)
                .select('userId displayName email confidence resolvedBy createdAt')
                .lean();
            
            return res.json({
                status: true,
                data: {
                    overview: stats[0] || { 
                        total: 0, 
                        avgConfidence: 0 
                    },
                    byMethod: methodStats,
                    lowConfidenceCount,
                    recentMappings
                }
            });
            
        } catch (error) {
            console.error('Error fetching user mapping stats:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch user mapping statistics',
                error: error.message
            });
        }
    }
    
    // Get all user mappings with pagination
    static async getUserMappings(req, res) {
        try {
            const { 
                page = 1, 
                limit = 20, 
                search = '', 
                resolvedBy = '',
                minConfidence = 0,
                sortBy = 'createdAt',
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
            
            if (minConfidence > 0) {
                query.confidence = { $gte: parseInt(minConfidence) };
            }
            
            // Build sort
            const sort = {};
            sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
            
            const skip = (page - 1) * limit;
            
            const [mappings, total] = await Promise.all([
                UserMapping.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .populate('discoveredByAccount', 'email')
                    .lean(),
                UserMapping.countDocuments(query)
            ]);
            
            return res.json({
                status: true,
                data: {
                    mappings,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Error fetching user mappings:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to fetch user mappings',
                error: error.message
            });
        }
    }
    
    // Update a user mapping manually
    static async updateUserMapping(req, res) {
        try {
            const { id } = req.params;
            const { displayName, email, confidence } = req.body;
            
            if (!displayName || !email) {
                return res.status(400).json({
                    status: false,
                    message: 'Display name and email are required'
                });
            }
            
            const mapping = await UserMapping.findByIdAndUpdate(
                id,
                {
                    displayName,
                    email,
                    domain: email.split('@')[1],
                    confidence: confidence || 100,
                    resolvedBy: 'manual',
                    updatedAt: new Date()
                },
                { new: true, runValidators: true }
            );
            
            if (!mapping) {
                return res.status(404).json({
                    status: false,
                    message: 'User mapping not found'
                });
            }
            
            return res.json({
                status: true,
                message: 'User mapping updated successfully',
                data: mapping
            });
            
        } catch (error) {
            console.error('Error updating user mapping:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to update user mapping',
                error: error.message
            });
        }
    }
    
    // Delete a user mapping
    static async deleteUserMapping(req, res) {
        try {
            const { id } = req.params;
            
            const mapping = await UserMapping.findByIdAndDelete(id);
            
            if (!mapping) {
                return res.status(404).json({
                    status: false,
                    message: 'User mapping not found'
                });
            }
            
            return res.json({
                status: true,
                message: 'User mapping deleted successfully'
            });
            
        } catch (error) {
            console.error('Error deleting user mapping:', error);
            return res.status(500).json({
                status: false,
                message: 'Failed to delete user mapping',
                error: error.message
            });
        }
    }
}

module.exports = UserController;
