const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, username, password } = req.body;
    const loginValue = (email || username || '').trim();

    try {
        // Auto-provision default Ops Admin account if logging in with jaswanth@ethops.in
        if (loginValue.toLowerCase() === 'jaswanth@ethops.in') {
            const existingOps = await User.findOne({
                $or: [
                    { email: 'jaswanth@ethops.in' },
                    { username: 'jaswanth@ethops.in' }
                ]
            });
            if (!existingOps) {
                await User.create({
                    firstName: 'Jaswanth',
                    lastName: 'Narne',
                    username: 'jaswanth@ethops.in',
                    email: 'jaswanth@ethops.in',
                    password: 'Jashu@789',
                    phone: '9999999998',
                    role: 'ops_admin',
                    isActive: true
                });
            }
        }

        const escapedLogin = loginValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Find by email, username, phone number, OR employeeId (case-insensitive for email/username)
        const user = await User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${escapedLogin}$`, 'i') } },
                { username: { $regex: new RegExp(`^${escapedLogin}$`, 'i') } },
                { phone: loginValue },
                { employeeId: loginValue }
            ]
        }).select('+password');

        if (user && (await user.matchPassword(password))) {
            // Enforce Max 1 Active Login Per User: generate new sessionId & evict previous session
            const newSessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
            const hadExistingSession = Boolean(user.activeSessionId);
            await User.findByIdAndUpdate(user._id, {
                activeSessionId: newSessionId,
                lastLogin: new Date()
            });

            const io = req.app.get('socketio');
            if (io && hadExistingSession) {
                io.to(`auth_session_${user._id.toString()}`).emit('session_replaced', {
                    userId: user._id.toString(),
                    newSessionId,
                    role: user.role,
                    code: 'SESSION_REPLACED',
                    timestamp: new Date()
                });
            }

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
                sessionId: newSessionId,
                token: generateToken(user._id, newSessionId)
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

// @desc    Ensure default Ops Admin (jaswanth@ethops.in) exists in MongoDB
const ensureDefaultOpsAdmin = async () => {
    try {
        let opsAdmin = await User.findOne({
            $or: [
                { email: 'jaswanth@ethops.in' },
                { username: 'jaswanth@ethops.in' }
            ]
        });

        if (opsAdmin) {
            opsAdmin.firstName = opsAdmin.firstName || 'Jaswanth';
            opsAdmin.lastName = opsAdmin.lastName || 'Narne';
            opsAdmin.email = 'jaswanth@ethops.in';
            opsAdmin.username = 'jaswanth@ethops.in';
            opsAdmin.role = 'ops_admin';
            opsAdmin.password = 'Jashu@789';
            opsAdmin.isActive = true;
            await opsAdmin.save();
            console.log('[OpsAdmin] Default Ops Admin (jaswanth@ethops.in) verified & active.');
        } else {
            await User.create({
                firstName: 'Jaswanth',
                lastName: 'Narne',
                username: 'jaswanth@ethops.in',
                email: 'jaswanth@ethops.in',
                password: 'Jashu@789',
                phone: '9999999998',
                role: 'ops_admin',
                isActive: true
            });
            console.log('[OpsAdmin] Default Ops Admin (jaswanth@ethops.in) created successfully.');
        }
    } catch (err) {
        console.error('[OpsAdmin] Failed to seed default Ops Admin:', err.message);
    }
};

const generateToken = (id, sessionId) => {
    return jwt.sign({ id, sessionId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d'
    });
};

module.exports = { loginUser, getMe, seedAdmin, ensureDefaultOpsAdmin };
