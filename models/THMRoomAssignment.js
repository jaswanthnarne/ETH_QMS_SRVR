const mongoose = require('mongoose');

const thmRoomAssignmentSchema = new mongoose.Schema({
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: true
    },
    roomNumber: {
        type: Number,
        required: true
    },
    roomCode: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    maxMarks: {
        type: Number,
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('THMRoomAssignment', thmRoomAssignmentSchema);
