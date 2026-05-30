const express = require('express');
const router = express.Router();
const { getCollegeAnalytics, getTrainerAnalytics, exportMasterSheet, getLeaderboard } = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/college-stats', protect, authorize('super_admin', 'college_admin'), getCollegeAnalytics);
router.get('/trainer-stats', protect, authorize('trainer'), getTrainerAnalytics);
router.get('/export', protect, authorize('super_admin', 'college_admin', 'trainer'), exportMasterSheet);
router.get('/leaderboard', protect, authorize('super_admin', 'college_admin', 'trainer'), getLeaderboard);

module.exports = router;
