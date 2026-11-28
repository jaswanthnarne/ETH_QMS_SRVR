const express = require('express');
const router = express.Router();
const {
    protectAnyAlgoActor,
    requireAlgoAdmin,
    getAlgoTopicOverrides,
    upsertAlgoTopicConfig,
    resetAlgoTopicConfig
} = require('../controllers/algoPlayController');

router.use(protectAnyAlgoActor);

// Accessible to all Students, Trainers, Ops Admins & Admins
router.get('/topics', getAlgoTopicOverrides);

// Admin & Ops Admin Customization Routes
router.put('/topics/:slug', requireAlgoAdmin, upsertAlgoTopicConfig);
router.delete('/topics/:slug/reset', requireAlgoAdmin, resetAlgoTopicConfig);

module.exports = router;
