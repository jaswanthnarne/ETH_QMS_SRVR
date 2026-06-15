const mongoose = require('mongoose');

const trainerCourseMapSchema = new mongoose.Schema({
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Trainer is required']
    },
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
    assignedDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'relieved'],
        default: 'active'
    },
    classroomLocation: {
        type: String,
        default: ''
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// A trainer can only be mapped once to a course at a college
trainerCourseMapSchema.index({ trainerId: 1, collegeId: 1, courseId: 1 }, { unique: true });
trainerCourseMapSchema.index({ collegeId: 1, courseId: 1 }); // For fetching trainers by college-course

module.exports = mongoose.model('TrainerCourseMap', trainerCourseMapSchema);
