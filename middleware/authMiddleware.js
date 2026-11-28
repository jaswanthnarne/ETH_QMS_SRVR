const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'User account not found' });
            }
            if (req.user.activeSessionId && decoded.sessionId !== req.user.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            return next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};

const protectStudent = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.student = await Student.findById(decoded.id).select('-password');
            if (!req.student) {
                return res.status(401).json({ success: false, error: 'Student account not found' });
            }
            if (req.student.activeSessionId && decoded.sessionId !== req.student.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            return next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized, no token' });
    }
};

module.exports = { protect, authorize, protectStudent };

