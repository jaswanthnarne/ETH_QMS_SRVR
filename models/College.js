const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'College name is required'],
        unique: true
    },
    code: {
        type: String,
        required: [true, 'College code is required'],
        unique: true
    },
    address: String,
    contactEmail: String,
    contactPhone: String,
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('College', collegeSchema);
