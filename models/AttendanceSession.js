const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late', 'excused'],
        default: 'present'
    },
    remarks: {
        type: String,
        default: ''
    }
}, { _id: false });

const attendanceSessionSchema = new mongoose.Schema({
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: true
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    topic: {
        type: String,
        required: true,
        trim: true
    },
    duration: {
        type: Number, // in minutes
        default: 60
    },
    period: {
        type: String,
        default: 'Session 1'
    },
    module: {
        type: String,
        required: true,
        default: 'Module 1'
    },
    records: [attendanceRecordSchema]
}, {
    timestamps: true
});

// Indexes for fast querying and reporting
attendanceSessionSchema.index({ batchId: 1, date: -1 });
attendanceSessionSchema.index({ collegeId: 1 });
attendanceSessionSchema.index({ trainerId: 1 });
attendanceSessionSchema.index({ 'records.studentId': 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
