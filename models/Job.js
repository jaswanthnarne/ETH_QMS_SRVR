const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Job title is required'],
        trim: true
    },
    company: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Job description is required']
    },
    location: {
        type: String,
        trim: true
    },
    salaryPackage: {
        type: String, // CTC (e.g. "8 LPA")
        trim: true
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: [true, 'College reference is required']
    },
    targetBatches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch'
    }],
    rules: {
        minCgpa: {
            type: Number,
            default: null
        },
        maxBacklogs: {
            type: Number,
            default: null
        },
        allowedDepartments: [{
            type: String,
            trim: true
        }]
    },
    examId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        default: null
    },
    googleFormUrl: {
        type: String,
        default: null,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Job', jobSchema);
