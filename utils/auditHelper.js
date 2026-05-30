const AuditLog = require('../models/AuditLog');

const logAudit = async (req, action, targetType, targetId, targetName, details = {}) => {
    try {
        let collegeId = req.user?.collegeId || req.params?.collegeId || req.query?.collegeId || req.body?.collegeId;
        if (!collegeId && targetType === 'College') {
            collegeId = targetId;
        }

        await AuditLog.create({
            userId: req.user?._id,
            collegeId,
            userName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.username || req.user?.phone || 'System',
            userRole: req.user?.role || 'system',
            action,
            targetType,
            targetId,
            targetName,
            details,
            ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent']
        });

        const io = req.app?.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'audit_logs',
                action: 'create',
                data: { targetType, targetId, targetName, action },
                timestamp: new Date()
            });
        }
    } catch (err) {
        console.error('Audit log error:', err.message);
    }
};

module.exports = { logAudit };
