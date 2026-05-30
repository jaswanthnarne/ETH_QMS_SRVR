const Notification = require('../models/Notification');

// @desc    Get notifications for the logged-in user (Super Admin gets all, College Admin gets college-specific)
// @route   GET /api/notifications
// @access  Private (Admins only)
exports.getNotifications = async (req, res) => {
    try {
        const user = req.user;
        let filter = {};
        if (user.role === 'college_admin') {
            filter.collegeId = user.collegeId;
        }

        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(50);

        // Count unread notifications (not in readBy array)
        const unreadCount = await Notification.countDocuments({
            ...filter,
            readBy: { $ne: user._id }
        });

        // Format notifications to return isRead flag relative to current user
        const formatted = notifications.map(n => {
            const doc = n.toObject();
            doc.isRead = n.readBy.some(id => id.toString() === user._id.toString());
            return doc;
        });

        res.json({
            success: true,
            count: formatted.length,
            unreadCount,
            data: formatted
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Mark a notification as read for the logged-in user
// @route   PUT /api/notifications/:id/read
// @access  Private (Admins only)
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        // Add user to readBy list if not already present
        if (!notification.readBy.includes(req.user._id)) {
            notification.readBy.push(req.user._id);
            await notification.save();
        }

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Mark all notifications as read for the logged-in user
// @route   DELETE /api/notifications/clear
// @access  Private (Admins only)
exports.clearAll = async (req, res) => {
    try {
        const user = req.user;
        let filter = {};
        if (user.role === 'college_admin') {
            filter.collegeId = user.collegeId;
        }

        // Add user._id to readBy list for all match notifications that do not have it
        await Notification.updateMany(
            { ...filter, readBy: { $ne: user._id } },
            { $addToSet: { readBy: user._id } }
        );

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
