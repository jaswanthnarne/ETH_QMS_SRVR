const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema({
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: [true, 'Job reference is required']
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student reference is required']
    },
    attemptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentAttempt',
        default: null
    },
    screeningScore: {
        type: Number,
        default: null
    },
    status: {
        type: String,
        enum: ['applied', 'screening_passed', 'screening_failed', 'shortlisted', 'sent_to_company', 'rejected'],
        default: 'applied'
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// A student can apply to a job posting only once
jobApplicationSchema.index({ jobId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
