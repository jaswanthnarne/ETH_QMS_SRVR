const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const AuditLog = require('../models/AuditLog');

// All audit routes require auth
router.use(protect);
router.use(authorize('super_admin', 'college_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'placement'));

// GET /api/audit/logs — paginated audit logs
router.get('/logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const skip = (page - 1) * limit;

        const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
        const collegesList = isRegionalRole ? [
            ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
            ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
        ] : [];

        const filter = {};
        if (req.user.role === 'college_admin' || req.user.role === 'placement') {
            filter.collegeId = req.user.collegeId;
        } else if (isRegionalRole) {
            if (req.query.collegeId) {
                if (collegesList.includes(req.query.collegeId.toString())) {
                    filter.collegeId = req.query.collegeId;
                } else {
                    return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
                }
            } else {
                filter.collegeId = { $in: collegesList };
            }
        } else if (req.query.collegeId) {
            filter.collegeId = req.query.collegeId;
        }

        if (req.query.action) filter.action = req.query.action;
        if (req.query.targetType) filter.targetType = req.query.targetType;
        if (req.query.userId) filter.userId = req.query.userId;
        if (req.query.search) {
            filter.$or = [
                { userName: { $regex: req.query.search, $options: 'i' } },
                { targetName: { $regex: req.query.search, $options: 'i' } },
                { action: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            AuditLog.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
