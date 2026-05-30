const User = require('../models/User');
const jwt = require('jsonwebtoken');

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, username, password } = req.body;
    const loginValue = email || username;

    try {
        // Find by email, username, phone number, OR employeeId
        const user = await User.findOne({
            $or: [
                { email: loginValue },
                { username: loginValue },
                { phone: loginValue },
                { employeeId: loginValue }
            ]
        }).select('+password');

        if (user && (await user.matchPassword(password))) {
            res.json({
                success: true,
                _id: user._id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                collegeId: user.collegeId,
                assignedColleges: user.assignedColleges,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Seed initial Super Admin
// @route   POST /api/auth/seed-admin
// @access  Public
const seedAdmin = async (req, res) => {
    try {
        let admin = await User.findOne({ email: 'admin@ethnotech.com' });
        
        if (admin) {
            admin.password = 'Eth@dm!n56';
            await admin.save();
            return res.status(200).json({ success: true, message: 'Admin password reset successfully' });
        }

        admin = await User.create({
            firstName: 'Super',
            lastName: 'Admin',
            email: 'admin@ethnotech.com',
            password: 'Eth@dm!n56',
            phone: '9999999999',
            role: 'super_admin'
        });

        res.status(201).json({
            success: true,
            message: 'Super Admin seeded successfully',
            email: admin.email,
            password: 'Eth@dm!n56'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};

module.exports = { loginUser, getMe, seedAdmin };
