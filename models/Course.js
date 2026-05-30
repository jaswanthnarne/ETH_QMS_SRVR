const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: [true, 'Course name is required']
    },
    code: {
        type: String,
        required: [true, 'Course code is required']
    },
    description: String,
    duration: String,
    modulesCount: {
        type: Number,
        default: 5
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Ensure course code is unique within a college
courseSchema.index({ collegeId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Course', courseSchema);
