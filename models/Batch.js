const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
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
    batchName: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    program: {
        type: String,
        enum: ['EWDP', 'CFS', 'PMKVY', 'CMKKY']
    },
    startDate: Date,
    endDate: Date,
    status: {
        type: String,
        enum: ['active', 'completed', 'upcoming'],
        default: 'active'
    },
    studentCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

batchSchema.index({ trainerId: 1 });
batchSchema.index({ collegeId: 1 });
batchSchema.index({ collegeId: 1, courseId: 1 }); // Fast lookup for college-course batches
batchSchema.index({ collegeId: 1, batchName: 1 }, { unique: true }); // Prevent duplicate names in the same college

module.exports = mongoose.model('Batch', batchSchema);
