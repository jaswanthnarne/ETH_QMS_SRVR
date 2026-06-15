const express = require('express');
const router = express.Router();
const {
    recordAttendance,
    getBatchAttendance,
    getSessionDetails,
    updateAttendance,
    deleteAttendance,
    getBatchAttendanceReport,
    getStudentAttendanceReport,
    getBatchDaywiseReport
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All attendance endpoints require authentication
router.use(protect);

const ALL_ADMINS = ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin'];

// Record new attendance session
router.post('/', authorize(...ALL_ADMINS, 'trainer'), recordAttendance);

// Get all attendance sessions for a batch
router.get('/batch/:batchId', authorize(...ALL_ADMINS, 'trainer'), getBatchAttendance);

// Get specific attendance session details
router.get('/session/:id', authorize(...ALL_ADMINS, 'trainer'), getSessionDetails);

// Update/Edit an attendance session
router.put('/session/:id', authorize(...ALL_ADMINS, 'trainer'), updateAttendance);

// Delete an attendance session
router.delete('/session/:id', authorize(...ALL_ADMINS, 'trainer'), deleteAttendance);

// Attendance report for all students in a batch
router.get('/reports/batch/:batchId', authorize(...ALL_ADMINS, 'trainer'), getBatchAttendanceReport);

// Day-wise attendance matrix for a batch (admin view)
router.get('/reports/batch/:batchId/daywise', authorize(...ALL_ADMINS), getBatchDaywiseReport);

// Attendance history report for a single student
router.get('/reports/student/:studentId', authorize(...ALL_ADMINS, 'trainer'), getStudentAttendanceReport);

module.exports = router;
