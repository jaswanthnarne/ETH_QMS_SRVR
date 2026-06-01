const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values for admins who use email
    },
    employeeId: {
        type: String,
        unique: true,
        sparse: true
    },
    firstName: {
        type: String,
        required: false
    },
    lastName: {
        type: String,
        required: false
    },
    email: {
        type: String,
        sparse: true,
        default: undefined,
        index: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false
    },
    phone: {
        type: String,
        required: false,
        index: true
    },
    role: {
        type: String,
        enum: ['super_admin', 'college_admin', 'trainer'],
        default: 'trainer'
    },
    collegeId: { // Primary College
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College'
    },
    assignedColleges: [{ // Supporting multiple colleges
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College'
    }],
    assignedCourses: [{ // Many-to-many trainer-course assignment
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: Date
}, {
    timestamps: true
});

// Encrypt password using bcrypt
userSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
