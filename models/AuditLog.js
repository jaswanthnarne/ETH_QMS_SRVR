const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    userName: String,
    userRole: String,
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: mongoose.Schema.Types.ObjectId,
    targetName: String,
    details: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ collegeId: 1 });
auditLogSchema.index({ targetType: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
