const TrainingLog = require('../models/TrainingLog');

// @desc    Create a new daily training log
// @route   POST /api/trainer/logs
// @access  Private (Trainer only)
exports.createLog = async (req, res) => {
    try {
        const { collegeId, courseId, startDate, logDate, batches } = req.body;

        if (!collegeId || !courseId || !startDate || !logDate || !batches || !batches.length) {
            return res.status(400).json({ success: false, error: 'All fields including at least one batch are required' });
        }

        const log = await TrainingLog.create({
            trainerId: req.user._id,
            collegeId,
            courseId,
            startDate,
            logDate,
            batches
        });

        // Create notification
        const Notification = require('../models/Notification');
        const Course = require('../models/Course');
        const trainerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.phone || req.user.username;
        const course = await Course.findById(courseId);
        
        const notif = await Notification.create({
            title: 'New Training Log Entry',
            message: `Trainer ${trainerName} logged a training progress entry for course "${course?.name || 'Course'}" with ${batches.length} batches held.`,
            type: 'log_submitted',
            collegeId
        });

        // Emit socket notification to active listeners real-time
        const io = req.app.get('socketio');
        if (io) {
            io.emit('new_notification', {
                ...notif.toObject(),
                isRead: false
            });
            io.emit('data_updated', {
                resource: 'training_logs',
                action: 'create',
                data: { id: log._id, trainerId: log.trainerId, collegeId, courseId },
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, data: log });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all training logs for the logged-in trainer
// @route   GET /api/trainer/logs
// @access  Private (Trainer only)
exports.getLogs = async (req, res) => {
    try {
        const logs = await TrainingLog.find({ trainerId: req.user._id })
            .populate('collegeId', 'name')
            .populate('courseId', 'name code')
            .sort({ logDate: -1, createdAt: -1 });

        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update a training log
// @route   PUT /api/trainer/logs/:id
// @access  Private (Trainer only)
exports.updateLog = async (req, res) => {
    try {
        let log = await TrainingLog.findById(req.params.id);

        if (!log) {
            return res.status(404).json({ success: false, error: 'Training log not found' });
        }

        // Verify ownership
        if (log.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this log' });
        }

        const { collegeId, courseId, startDate, logDate, batches } = req.body;

        log.collegeId = collegeId || log.collegeId;
        log.courseId = courseId || log.courseId;
        log.startDate = startDate || log.startDate;
        log.logDate = logDate || log.logDate;
        log.batches = batches || log.batches;

        await log.save();

        const io = req.app.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'training_logs',
                action: 'update',
                data: { id: log._id, trainerId: log.trainerId, collegeId: log.collegeId, courseId: log.courseId },
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Training log updated successfully', data: log });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete a training log
// @route   DELETE /api/trainer/logs/:id
// @access  Private (Trainer only)
exports.deleteLog = async (req, res) => {
    try {
        const log = await TrainingLog.findById(req.params.id);

        if (!log) {
            return res.status(404).json({ success: false, error: 'Training log not found' });
        }

        // Verify ownership
        if (log.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this log' });
        }

        await log.deleteOne();

        const io = req.app.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'training_logs',
                action: 'delete',
                data: { id: log._id, trainerId: log.trainerId, collegeId: log.collegeId, courseId: log.courseId },
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Training log removed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
