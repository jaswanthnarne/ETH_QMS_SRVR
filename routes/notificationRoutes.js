const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getNotifications, markAsRead, clearAll } = require('../controllers/notificationController');

// Notifications are used by admins and trainers.
router.use(protect);
router.use(authorize('super_admin', 'college_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'trainer'));

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.delete('/clear', clearAll);

module.exports = router;
