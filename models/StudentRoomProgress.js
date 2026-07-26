const mongoose = require('mongoose');

const studentRoomProgressSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'THMRoomAssignment',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
    completedAt: Date,
    obtainedMarks: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

studentRoomProgressSchema.index({ studentId: 1, assignmentId: 1 }, { unique: true });

module.exports = mongoose.model('StudentRoomProgress', studentRoomProgressSchema);
