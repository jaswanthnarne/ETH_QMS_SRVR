const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getNotifications, markAsRead, clearAll } = require('../controllers/notificationController');

// All notification routes are protected and restricted to admins
router.use(protect);
router.use(authorize('super_admin', 'college_admin'));

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.delete('/clear', clearAll);

module.exports = router;
