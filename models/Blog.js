const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
    {
        authorId: { type: mongoose.Schema.Types.ObjectId, required: true },
        authorName: { type: String, required: true, trim: true },
        authorRole: { type: String, required: true },
        authorRoleLabel: { type: String, default: '' },
        text: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Blog title is required'],
            trim: true
        },
        subtitle: {
            type: String,
            trim: true,
            default: ''
        },
        content: {
            type: String,
            required: [true, 'Blog content is required']
        },
        coverImage: {
            type: String,
            default: ''
        },
        images: [
            {
                url: { type: String, required: true },
                caption: { type: String, trim: true, default: '' }
            }
        ],
        category: {
            type: String,
            trim: true,
            default: 'Engineering & Code'
        },
        fontStyle: {
            type: String,
            enum: ['serif', 'sans', 'mono'],
            default: 'serif'
        },
        tags: [{ type: String, trim: true }],
        readingTimeMinutes: {
            type: Number,
            default: 3
        },

        // Author Identity
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        authorModel: {
            type: String,
            enum: ['User', 'Student'],
            required: true
        },
        authorName: {
            type: String,
            required: true,
            trim: true
        },
        authorRole: {
            type: String,
            required: true
        },
        authorRoleLabel: {
            type: String,
            default: ''
        },
        authorHeadline: {
            type: String,
            default: ''
        },

        // Audience & Batch/College Scoping
        isGlobal: {
            type: Boolean,
            default: false
        },
        targetColleges: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'College'
            }
        ],
        targetBatches: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Batch'
            }
        ],

        // Editorial & Engagement
        status: {
            type: String,
            enum: ['published', 'draft'],
            default: 'published'
        },
        isPinned: {
            type: Boolean,
            default: false
        },
        claps: {
            type: Number,
            default: 0
        },
        clappedBy: [{ type: String }],
        comments: [commentSchema]
    },
    {
        timestamps: true
    }
);

blogSchema.index({ isGlobal: 1, status: 1, createdAt: -1 });
blogSchema.index({ targetColleges: 1, status: 1, createdAt: -1 });
blogSchema.index({ targetBatches: 1, status: 1, createdAt: -1 });
blogSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);
