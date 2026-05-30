const mongoose = require('mongoose');

const studentAttemptSchema = new mongoose.Schema({
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrainerExamKey',
        required: true
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    studentDetails: {
        name: { type: String, required: true },
        rollNumber: { type: String, required: true },
        department: String,
        email: String,
        mobile: String,
        college: String,
        course: String
    },
    assignedQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],
    certificateId: {
        type: String,
        unique: true,
        sparse: true
    },
    answers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        answer: [String], // Array of IDs or text for fill-blanks
        isCorrect: Boolean,
        marksObtained: Number,
        timeSpent: Number // seconds
    }],
    totalScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    result: { type: String, enum: ['pass', 'fail', 'pending'], default: 'pending' },
    status: { type: String, enum: ['started', 'completed', 'violated'], default: 'started' },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    violations: {
        tabSwitches: { type: Number, default: 0 },
        fullScreenExits: { type: Number, default: 0 },
        copyAttempts: { type: Number, default: 0 },
        devToolsAttempts: { type: Number, default: 0 },
        windowBlurs: { type: Number, default: 0 },
        overlaysDetected: { type: Number, default: 0 },
        idleTimeouts: { type: Number, default: 0 }
    },
    clientSessionId: { type: String, unique: true, sparse: true },
    lastDisconnected: Date,
    resumeCount: { type: Number, default: 0 },
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true
});

// Compound unique index: student can only attempt a specific exam once
studentAttemptSchema.index({ examId: 1, 'studentDetails.rollNumber': 1 }, { unique: true });
studentAttemptSchema.index({ trainerId: 1 });

module.exports = mongoose.model('StudentAttempt', studentAttemptSchema);
