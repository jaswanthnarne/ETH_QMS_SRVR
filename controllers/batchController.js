const mongoose = require('mongoose');
const Batch = require('../models/Batch');

// @desc    Create a new batch template
// @route   POST /api/trainer/batches
// @access  Private (Trainer only)
exports.createBatch = async (req, res) => {
    try {
        const { collegeId, courseId, batchName, department } = req.body;

        if (!collegeId || !courseId || !batchName || !department) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        const batch = await Batch.create({
            trainerId: req.user._id,
            collegeId,
            courseId,
            batchName,
            department
        });

        res.status(201).json({ success: true, data: batch });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all batch templates for the logged-in trainer
// @route   GET /api/trainer/batches
// @access  Private (Trainer only)
exports.getBatches = async (req, res) => {
    try {
        const collegeId = req.params.collegeId || req.query.collegeId || req.user.collegeId;
        
        let filter = {};
        if (collegeId && mongoose.Types.ObjectId.isValid(collegeId)) {
            filter.collegeId = collegeId;
        }

        if (req.user.role === 'trainer') {
            filter.trainerId = req.user._id;
        }

        const batches = await Batch.find(filter)
            .populate('collegeId', 'name')
            .populate('courseId', 'name code')
            .populate('trainerId', 'firstName lastName username')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: batches.length, data: batches });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update a batch template
// @route   PUT /api/trainer/batches/:id
// @access  Private (Trainer only)
exports.updateBatch = async (req, res) => {
    try {
        let batch = await Batch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Verify ownership
        if (batch.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this batch' });
        }

        const { collegeId, courseId, batchName, department } = req.body;

        batch.collegeId = collegeId || batch.collegeId;
        batch.courseId = courseId || batch.courseId;
        batch.batchName = batchName || batch.batchName;
        batch.department = department || batch.department;

        await batch.save();

        res.json({ success: true, message: 'Batch updated successfully', data: batch });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete a batch template
// @route   DELETE /api/trainer/batches/:id
// @access  Private (Trainer only)
exports.deleteBatch = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Verify ownership
        if (batch.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this batch' });
        }

        await batch.deleteOne();

        res.json({ success: true, message: 'Batch removed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
