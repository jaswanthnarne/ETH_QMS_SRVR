const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: [true, 'Batch is required']
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: [true, 'College is required']
    },
    name: {
        type: String,
        required: [true, 'Student name is required']
    },
    usn: {
        type: String,
        required: [true, 'USN is required']
    },
    mobile: String,
    email: String,
    semester: String,
    department: String,
    division: String,
    cgpa: {
        type: Number,
        default: 0.0
    },
    backlogs: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'dropped'],
        default: 'active'
    },
    password: {
        type: String,
        select: false
    },
    skills: [String],
    capabilities: String,
    jobPreferences: {
        preferredRoles: [String],
        preferredLocations: [String],
        expectedCTC: String,
        jobType: {
            type: String,
            enum: ['Full-time', 'Internship', 'Contract', 'Any'],
            default: 'Any'
        }
    },
    resumeUrl: String
}, {
    timestamps: true
});

// Encrypt password using bcrypt
studentSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match entered password
studentSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// USN must be unique within a college to allow duplicate USNs across different colleges
studentSchema.index({ collegeId: 1, usn: 1 }, { unique: true });
studentSchema.index({ batchId: 1 }); // Fast lookup by batch
studentSchema.index({ collegeId: 1 }); // Fast lookup by college

module.exports = mongoose.model('Student', studentSchema);

