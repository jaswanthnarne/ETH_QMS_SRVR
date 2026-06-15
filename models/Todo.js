const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    dueDate: {
        type: Date
    },
    isStarred: {
        type: Boolean,
        default: false
    },
    isPriority: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'deleted'],
        default: 'pending'
    },
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

todoSchema.index({ studentId: 1 });
todoSchema.index({ status: 1 });
todoSchema.index({ dueDate: 1 });

module.exports = mongoose.model('Todo', todoSchema);
