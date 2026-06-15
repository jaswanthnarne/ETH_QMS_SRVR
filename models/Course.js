const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College'
        // No longer required — courses are global. Kept for backward compat during migration.
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
    program: {
        type: String,
        enum: ['EWDP', 'CFS', 'PMKVY', 'CMKKY']
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    syllabusUrl: String
}, {
    timestamps: true
});

// Course code is globally unique now
courseSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Course', courseSchema);
