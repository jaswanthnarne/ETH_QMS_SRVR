const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    examKey: {
        type: String,
        required: true,
        index: true
    },
    senderRole: {
        type: String,
        enum: ['student', 'trainer'],
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    senderId: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true,
        maxlength: 500
    },
    // For trainer → specific student direct messages (optional)
    recipientId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient fetching of chat history per exam session
chatMessageSchema.index({ examKey: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
