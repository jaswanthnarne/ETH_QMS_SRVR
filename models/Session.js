const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    trainerKeyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrainerExamKey',
        required: true
    },
    sessionCode: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['waiting', 'active', 'completed'],
        default: 'waiting'
    },
    waitingRoomCount: {
        type: Number,
        default: 0
    },
    startedAt: Date,
    endedAt: Date,
    endedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    totalStudents: {
        type: Number,
        default: 0
    },
    completedCount: {
        type: Number,
        default: 0
    },
    averageScore: {
        type: Number,
        default: 0
    },
    passCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Session', sessionSchema);
