const express = require('express');
const router = express.Router();
const { loginUser, getMe, seedAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/seed-admin', seedAdmin); // Temporary for initial setup

module.exports = router;
