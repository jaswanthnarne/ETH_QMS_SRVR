const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true
    },
    type: {
        type: String,
        enum: ['mcq', 'multiple', 'true_false', 'descriptive', 'fill_blanks', 'fill_blank', 'match_following', 'ordering', 'numeric', 'single_correct', 'multiple_correct', 'coding'],
        required: true
    },
    correctAnswerText: {
        type: String, // Used for fill_blank and numeric types
        default: null
    },
    text: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true
    },
    order: {
        type: Number,
        required: true
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
    sectionIndex: {
        type: Number,
        default: 0
    },
    codingDetails: {
        language: { type: String, default: 'javascript' },
        initialCode: String,
        testCases: [{ input: String, expectedOutput: String, isHidden: { type: Boolean, default: false } }]
    },
    imageUrl: String,
    metadata: {
        topic: String,
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium'
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Question', questionSchema);
