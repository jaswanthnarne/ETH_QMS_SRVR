const mongoose = require('mongoose');

const materialFileSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    contentType: {
        type: String,
        default: 'application/pdf'
    },
    size: {
        type: Number,
        default: 0
    },
    data: {
        type: Buffer,
        required: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('MaterialFile', materialFileSchema);

