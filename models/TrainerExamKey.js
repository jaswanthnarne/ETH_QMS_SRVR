const mongoose = require('mongoose');

const trainerExamKeySchema = new mongoose.Schema({
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
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: false
    },
    uniqueKey: {
        type: String,
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isStarted: {
        type: Boolean,
        default: false
    },
    isPaused: {
        type: Boolean,
        default: false
    },
    lastUsed: Date
}, {
    timestamps: true
});

module.exports = mongoose.model('TrainerExamKey', trainerExamKeySchema);
