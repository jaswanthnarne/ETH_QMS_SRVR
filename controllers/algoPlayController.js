const jwt = require('jsonwebtoken');
const AlgoTopicConfig = require('../models/AlgoTopicConfig');
const User = require('../models/User');
const Student = require('../models/Student');

const CUSTOMIZER_ROLES = ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin'];

const protectAnyAlgoActor = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Not authorized, no token' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password').lean();
        if (user) {
            if (user.activeSessionId && decoded.sessionId !== user.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            req.actor = {
                id: user._id,
                role: user.role,
                canCustomize: CUSTOMIZER_ROLES.includes(user.role),
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
            };
            return next();
        }

        const student = await Student.findById(decoded.id).select('-password').lean();
        if (student) {
            if (student.activeSessionId && decoded.sessionId !== student.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            req.actor = {
                id: student._id,
                role: 'student',
                canCustomize: false,
                name: student.name,
                usn: student.usn
            };
            return next();
        }

        return res.status(401).json({ success: false, error: 'Account not found' });
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
};

const requireAlgoAdmin = (req, res, next) => {
    if (!req.actor || !req.actor.canCustomize) {
        return res.status(403).json({
            success: false,
            error: 'Only Admin and Ops Admin accounts can customize AlgoPlay visualizer topics.'
        });
    }
    return next();
};

/* ─────────────────── GET /api/algoplay/topics ─────────────────── */
const getAlgoTopicOverrides = async (req, res) => {
    try {
        const docs = await AlgoTopicConfig.find().sort({ sequenceOrder: 1 }).lean();
        res.json({
            success: true,
            canCustomize: Boolean(req.actor?.canCustomize),
            data: docs
        });
    } catch (err) {
        console.error('getAlgoTopicOverrides error:', err);
        res.status(500).json({ success: false, error: 'Failed to load AlgoPlay configuration' });
    }
};

/* ─────────────────── PUT /api/algoplay/topics/:slug ─────────────────── */
const upsertAlgoTopicConfig = async (req, res) => {
    try {
        const slug = String(req.params.slug || req.body.slug || '')
            .toLowerCase()
            .trim();
        if (!slug) {
            return res.status(400).json({ success: false, error: 'Topic slug is required' });
        }

        const body = req.body || {};
        const updateDoc = {
            slug,
            updatedBy: req.actor.id
        };

        const stringFields = [
            'name',
            'category',
            'categoryLabel',
            'engineType',
            'difficulty',
            'shortDescription'
        ];
        stringFields.forEach((f) => {
            if (body[f] !== undefined) updateDoc[f] = String(body[f]).trim();
        });

        if (body.sequenceOrder !== undefined) updateDoc.sequenceOrder = Number(body.sequenceOrder) || 1;
        if (body.isRecommended !== undefined) updateDoc.isRecommended = Boolean(body.isRecommended);
        if (body.isPublished !== undefined) updateDoc.isPublished = Boolean(body.isPublished);
        if (body.isEnabled !== undefined) updateDoc.isEnabled = Boolean(body.isEnabled);

        if (body.overview && typeof body.overview === 'object') {
            updateDoc.overview = body.overview;
        }
        if (body.complexity && typeof body.complexity === 'object') {
            updateDoc.complexity = body.complexity;
        }
        if (Array.isArray(body.pseudocode)) {
            updateDoc.pseudocode = body.pseudocode.map((s) => String(s));
        }
        if (body.codeExamples && typeof body.codeExamples === 'object') {
            updateDoc.codeExamples = body.codeExamples;
        }
        if (Array.isArray(body.practiceQuestions)) {
            updateDoc.practiceQuestions = body.practiceQuestions;
        }

        const saved = await AlgoTopicConfig.findOneAndUpdate(
            { slug },
            { $set: updateDoc },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, data: saved });
    } catch (err) {
        console.error('upsertAlgoTopicConfig error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to save topic config' });
    }
};

/* ─────────────────── DELETE /api/algoplay/topics/:slug/reset ─────────────────── */
const resetAlgoTopicConfig = async (req, res) => {
    try {
        await AlgoTopicConfig.findOneAndDelete({ slug: req.params.slug });
        res.json({ success: true, message: 'Topic reset to default configuration' });
    } catch (err) {
        console.error('resetAlgoTopicConfig error:', err);
        res.status(500).json({ success: false, error: 'Failed to reset topic config' });
    }
};

module.exports = {
    protectAnyAlgoActor,
    requireAlgoAdmin,
    getAlgoTopicOverrides,
    upsertAlgoTopicConfig,
    resetAlgoTopicConfig
};
