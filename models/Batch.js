const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    batchName: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

batchSchema.index({ trainerId: 1 });
batchSchema.index({ collegeId: 1 });

module.exports = mongoose.model('Batch', batchSchema);
