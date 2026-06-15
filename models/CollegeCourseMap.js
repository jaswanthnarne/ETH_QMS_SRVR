const mongoose = require('mongoose');

const collegeCourseMapSchema = new mongoose.Schema({
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: [true, 'College is required']
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: [true, 'Course is required']
    },
    customDuration: {
        type: String // Optional override, e.g., "60 hours" vs default "120 hours"
    },
    startDate: Date,
    endDate: Date,
    status: {
        type: String,
        enum: ['active', 'completed'],
        default: 'active'
    },
    mappedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// A course can only be mapped once to a college
collegeCourseMapSchema.index({ collegeId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('CollegeCourseMap', collegeCourseMapSchema);
