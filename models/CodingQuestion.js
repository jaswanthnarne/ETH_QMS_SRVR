const mongoose = require('mongoose');

const paramSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        type: { type: String, trim: true, default: 'int' }
    },
    { _id: false }
);

const testCaseSchema = new mongoose.Schema(
    {
        args: { type: [mongoose.Schema.Types.Mixed], default: [] },
        expected: { type: mongoose.Schema.Types.Mixed },
        isHidden: { type: Boolean, default: false }
    },
    { _id: false }
);

const codingQuestionSchema = new mongoose.Schema(
    {
        qid: { type: String, required: true, unique: true, trim: true }, // e.g. tcs-1
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingCompany', required: true },
        company: { type: String, required: true, trim: true, lowercase: true }, // company slug
        number: { type: Number, default: 1 },
        title: { type: String, required: [true, 'Question title is required'], trim: true },
        difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
        topic: { type: String, trim: true, default: '' },
        frequency: { type: String, trim: true, default: '' },
        context: { type: String, trim: true, default: '' },
        fnName: { type: String, trim: true, default: 'solve' },
        params: { type: [paramSchema], default: [] },
        returnType: { type: String, trim: true, default: 'int' },
        description: { type: String, required: [true, 'Problem description is required'] },
        constraints: [{ type: String }],
        hint: { type: String, default: '' },
        starter: {
            python: { type: String, default: '' },
            javascript: { type: String, default: '' }
        },
        solution: {
            python: { type: String, default: '' },
            javascript: { type: String, default: '' }
        },
        testCases: { type: [testCaseSchema], default: [] },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true, minimize: false }
);

codingQuestionSchema.index({ companyId: 1, number: 1 });
codingQuestionSchema.index({ company: 1 });

module.exports = mongoose.model('CodingQuestion', codingQuestionSchema);
