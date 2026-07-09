const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: false
    },
    batches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch'
    }],
    title: {
        type: String,
        required: [true, 'Exam title is required']
    },
    department: {
        type: String,
        required: false
    },
    description: String,
    duration: {
        type: Number,
        required: [true, 'Duration in minutes is required']
    },
    totalMarks: {
        type: Number,
        default: 0
    },
    passingPercentage: {
        type: Number,
        required: true,
        default: 40
    },
    instructions: {
        type: String,
        default: 'Read questions carefully...'
    },
    scheduledDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: false
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    settings: {
        shuffleQuestions: { type: Boolean, default: false },
        showResultImmediately: { type: Boolean, default: true },
        allowReview: { type: Boolean, default: true },
        collectEmail: { type: Boolean, default: false },
        collectMobile: { type: Boolean, default: true },
        collectDepartment: { type: Boolean, default: true },
        enableCertificate: { type: Boolean, default: false },
        enableSections: { type: Boolean, default: false },
        enableNegativeMarking: { type: Boolean, default: false },
        negativeMarkValue: { type: Number, default: 0.25 },
        randomizeQuestions: { type: Boolean, default: false },
        randomQuestionCount: { type: Number, default: 0 },
        requireWebcam: { type: Boolean, default: false },
        requireMic: { type: Boolean, default: false },
        requireScreenshare: { type: Boolean, default: false },
        allowDownloadMarksheet: { type: Boolean, default: true },
        allowDownloadResponseMatrix: { type: Boolean, default: true },
        allowDownloadQuestionPaper: { type: Boolean, default: true }
    },
    sections: [{
        name: { type: String, required: true },
        description: String,
        order: { type: Number, default: 0 }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Exam', examSchema);
