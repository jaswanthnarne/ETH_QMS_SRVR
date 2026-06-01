const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true // 'exam_started', 'log_submitted', etc.
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        default: null
    },
    targetRoles: [{
        type: String,
        enum: ['super_admin', 'college_admin', 'trainer'],
        default: undefined
    }],
    targetUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema);
