const mongoose = require('mongoose');

const PracticeQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
        options: [{ type: String }],
        correctIndex: { type: Number, default: 0 },
        explanation: { type: String, default: '' }
    },
    { _id: false }
);

const AlgoTopicConfigSchema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        name: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ['linear', 'nonlinear', 'advanced', 'searching', 'sorting', 'trees', 'graphs', 'algorithms'],
            required: true
        },
        categoryLabel: { type: String, default: 'Data Structures' },
        engineType: { type: String, required: true },
        difficulty: {
            type: String,
            enum: ['Beginner', 'Intermediate', 'Advanced'],
            default: 'Beginner'
        },
        sequenceOrder: { type: Number, default: 1 },
        isRecommended: { type: Boolean, default: false },
        isPublished: { type: Boolean, default: true },
        isEnabled: { type: Boolean, default: true },
        shortDescription: { type: String, default: '' },
        overview: {
            whatItIs: { type: String, default: '' },
            whyUsed: { type: String, default: '' },
            howItStores: { type: String, default: '' },
            realWorldApplications: [{ type: String }],
            advantages: [{ type: String }],
            limitations: [{ type: String }],
            whenToUse: { type: String, default: '' }
        },
        complexity: {
            bestTime: { type: String, default: 'O(1)' },
            averageTime: { type: String, default: 'O(n)' },
            worstTime: { type: String, default: 'O(n)' },
            space: { type: String, default: 'O(1)' },
            inPlace: { type: Boolean, default: true },
            stable: { type: Boolean, default: true },
            simpleExplanation: { type: String, default: '' }
        },
        pseudocode: [{ type: String }],
        codeExamples: {
            c: { type: String, default: '' },
            cpp: { type: String, default: '' },
            java: { type: String, default: '' },
            python: { type: String, default: '' },
            javascript: { type: String, default: '' }
        },
        practiceQuestions: [PracticeQuestionSchema],
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

module.exports = mongoose.model('AlgoTopicConfig', AlgoTopicConfigSchema);
