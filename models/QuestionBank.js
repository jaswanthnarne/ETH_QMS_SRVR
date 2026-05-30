const mongoose = require('mongoose');

const questionBankSchema = new mongoose.Schema({
    // NOT tied to any specific exam — this is a global pool
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: [true, 'Course is required']
    },
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        index: true
    },
    topic: {
        type: String,
        default: ''
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    bloomsLevel: {
        type: String,
        enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],
        default: 'remember'
    },
    type: {
        type: String,
        enum: ['mcq', 'multiple', 'true_false', 'descriptive', 'fill_blanks', 'fill_blank', 'match_following', 'ordering', 'numeric', 'single_correct', 'multiple_correct', 'coding'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true,
        default: 1
    },
    correctAnswerText: {
        type: String,
        default: null
    },
    options: {
        choices: [{
            id: String,
            text: String,
            isCorrect: Boolean
        }],
        matchingPairs: [{
            left: String,
            right: String
        }],
        orderedItems: [String]
    },
    imageUrl: String,
    tags: [String],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes for efficient filtering
questionBankSchema.index({ collegeId: 1, subject: 1 });
questionBankSchema.index({ courseId: 1 });
questionBankSchema.index({ difficulty: 1 });
questionBankSchema.index({ bloomsLevel: 1 });
questionBankSchema.index({ tags: 1 });

module.exports = mongoose.model('QuestionBank', questionBankSchema);
