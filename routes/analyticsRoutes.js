const express = require('express');
const router = express.Router();
const {
    getCollegeAnalytics,
    getTrainerAnalytics,
    exportMasterSheet,
    getLeaderboard,
    getLogsAttendanceAnalytics,
    getAttendanceSummaryReport
} = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/authMiddleware');

const ALL_ADMINS = ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin', 'placement'];

router.get('/college-stats', protect, authorize(...ALL_ADMINS), getCollegeAnalytics);
router.get('/trainer-stats', protect, authorize('trainer'), getTrainerAnalytics);
router.get('/logs-attendance-stats', protect, authorize(...ALL_ADMINS, 'trainer'), getLogsAttendanceAnalytics);
router.get('/attendance-summary', protect, authorize(...ALL_ADMINS, 'trainer'), getAttendanceSummaryReport);
router.get('/export', protect, authorize(...ALL_ADMINS, 'trainer'), exportMasterSheet);
router.get('/leaderboard', protect, authorize(...ALL_ADMINS, 'trainer'), getLeaderboard);

module.exports = router;
