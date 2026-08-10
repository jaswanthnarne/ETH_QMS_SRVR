const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const TrainerCourseMap = require('../models/TrainerCourseMap');
const Student = require('../models/Student');
const { logAudit } = require('../utils/auditHelper');

const checkCollegeScope = (user, collegeId) => {
    if (['regional_manager', 'asst_rm'].includes(user.role)) {
        const collegesList = [
            ...(user.collegeId ? [user.collegeId] : []),
            ...(Array.isArray(user.assignedColleges) ? user.assignedColleges : [])
        ].map(id => id.toString());
        if (!collegeId || !collegesList.includes(collegeId.toString())) {
            return false;
        }
    }
    return true;
};

// @desc    Create a new batch (Trainer-initiated — legacy)
// @route   POST /api/trainer/batches
// @access  Private (Trainer only)
exports.createBatch = async (req, res) => {
    try {
        const { collegeId, courseId, batchName, department } = req.body;

        if (!collegeId || !batchName || !department) {
            return res.status(400).json({ success: false, error: 'College, batch name, and department are required' });
        }

        const trimmedBatchName = batchName.trim();
        const escapedBatchName = trimmedBatchName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const existingBatch = await Batch.findOne({
            collegeId,
            batchName: { $regex: new RegExp('^\\s*' + escapedBatchName + '\\s*$', 'i') }
        });
        if (existingBatch) {
            return res.status(400).json({
                success: false,
                error: `A batch with the name "${trimmedBatchName}" already exists in this college.`
            });
        }

        const batch = await Batch.create({
            trainerId: req.user._id,
            collegeId,
            courseId: courseId || undefined,
            batchName: trimmedBatchName,
            department: department.trim()
        });

        res.status(201).json({ success: true, data: batch });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create a new batch (Admin-initiated — ERP flow)
// @route   POST /api/admin/colleges/:collegeId/courses/:courseId/batches
// @access  Private (Admin only)
exports.createBatchAdmin = async (req, res) => {
    try {
        const collegeId = req.params.collegeId || req.body.collegeId;
        const courseId = req.params.courseId || req.body.courseId || null;
        const { trainerId, batchName, department, program, startDate, endDate } = req.body;

        if (collegeId && !checkCollegeScope(req.user, collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        if (!batchName || !department) {
            return res.status(400).json({ success: false, error: 'Batch name and department are required' });
        }

        // Validate mapping ONLY if both trainerId and courseId are provided
        if (trainerId && courseId) {
            const trainerMapping = await TrainerCourseMap.findOne({
                trainerId,
                collegeId,
                courseId,
                status: 'active'
            });

            if (!trainerMapping) {
                return res.status(400).json({
                    success: false,
                    error: 'This trainer is not mapped to this course at this college. Please assign the trainer first.'
                });
            }
        }

        const trimmedBatchName = batchName.trim();
        const escapedBatchName = trimmedBatchName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const existingBatch = await Batch.findOne({
            collegeId,
            batchName: { $regex: new RegExp('^\\s*' + escapedBatchName + '\\s*$', 'i') }
        });
        if (existingBatch) {
            return res.status(400).json({
                success: false,
                error: `A batch with the name "${trimmedBatchName}" already exists in this college.`
            });
        }

        const batch = await Batch.create({
            trainerId: trainerId || undefined,
            collegeId,
            courseId: courseId || undefined,
            batchName: trimmedBatchName,
            department: department.trim(),
            program,
            startDate,
            endDate
        });

        const populated = await Batch.findById(batch._id)
            .populate('trainerId', 'firstName lastName employeeId phone')
            .populate('courseId', 'name code')
            .populate('collegeId', 'name');

        await logAudit(req, 'CREATE_BATCH', 'Batch', batch._id, batch.batchName);

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all batch templates for the logged-in trainer
// @route   GET /api/trainer/batches
// @access  Private (Trainer only)
exports.getBatches = async (req, res) => {
    try {
        const collegeId = req.params.collegeId || req.query.collegeId;
        
        let filter = {};
        if (req.user.role === 'trainer') {
            filter.trainerId = req.user._id;
            if (collegeId && mongoose.Types.ObjectId.isValid(collegeId)) {
                filter.collegeId = collegeId;
            } else {
                const collegesList = [
                    ...(req.user.collegeId ? [req.user.collegeId] : []),
                    ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
                ];
                filter.collegeId = { $in: collegesList };
            }
        } else {
            const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
            const collegesList = isRegionalRole ? [
                ...(req.user.collegeId ? [req.user.collegeId] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
            ].map(id => id.toString()) : [];

            if (collegeId && mongoose.Types.ObjectId.isValid(collegeId)) {
                if (isRegionalRole && !collegesList.includes(collegeId.toString())) {
                    return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
                }
                filter.collegeId = collegeId;
            } else if (isRegionalRole) {
                filter.collegeId = { $in: collegesList };
            }
        }

        const batches = await Batch.find(filter)
            .populate('collegeId', 'name')
            .populate('courseId', 'name code')
            .populate('trainerId', 'firstName lastName username employeeId')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: batches.length, data: batches });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get a single batch by ID
// @route   GET /api/admin/batches/:id
// @access  Private (Admin & Trainer)
exports.getBatchById = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate('collegeId', 'name')
            .populate('courseId', 'name code program')
            .populate('trainerId', 'firstName lastName employeeId phone');
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (req.user.role === 'trainer') {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            const batchCollegeId = batch.collegeId?._id?.toString() || batch.collegeId?.toString();
            if (!collegesList.includes(batchCollegeId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to view this batch metadata' });
            }
        }

        res.json({ success: true, data: batch });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get batches for a college-course pair (Admin view)
// @route   GET /api/admin/colleges/:collegeId/courses/:courseId/batches
// @access  Private (Admin)
exports.getBatchesByCourse = async (req, res) => {
    try {
        const { collegeId, courseId } = req.params;
        const batches = await Batch.find({ collegeId, courseId })
            .populate('trainerId', 'firstName lastName employeeId phone')
            .populate('courseId', 'name code')
            .populate('collegeId', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: batches.length, data: batches });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update a batch template
// @route   PUT /api/trainer/batches/:id OR PUT /api/admin/batches/:id
// @access  Private
exports.updateBatch = async (req, res) => {
    try {
        let batch = await Batch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (batch.collegeId && !checkCollegeScope(req.user, batch.collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        // Trainers can only update their own batches; admins can update any
        if (req.user.role === 'trainer' && batch.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this batch' });
        }

        const { collegeId, courseId, batchName, department, program, startDate, endDate, status, trainerId } = req.body;

        if (collegeId && !checkCollegeScope(req.user, collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        const activeCollegeId = collegeId || batch.collegeId;
        const activeBatchName = (batchName !== undefined ? batchName : batch.batchName).trim();

        if (batchName || collegeId) {
            const escapedActiveBatchName = activeBatchName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const duplicate = await Batch.findOne({
                _id: { $ne: req.params.id },
                collegeId: activeCollegeId,
                batchName: { $regex: new RegExp('^\\s*' + escapedActiveBatchName + '\\s*$', 'i') }
            });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: `A batch with the name "${activeBatchName}" already exists in this college.`
                });
            }
        }

        if (collegeId) batch.collegeId = collegeId;
        if (courseId !== undefined) batch.courseId = courseId || null;
        if (batchName) batch.batchName = batchName.trim();
        if (department) batch.department = department.trim();
        if (program !== undefined) batch.program = program || undefined;
        if (startDate !== undefined) batch.startDate = startDate || undefined;
        if (endDate !== undefined) batch.endDate = endDate || undefined;
        if (status) batch.status = status;
        if (trainerId !== undefined) batch.trainerId = trainerId || null;

        await batch.save();

        const populated = await Batch.findById(batch._id)
            .populate('trainerId', 'firstName lastName employeeId phone')
            .populate('courseId', 'name code')
            .populate('collegeId', 'name');

        res.json({ success: true, message: 'Batch updated successfully', data: populated });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete a batch template and its students
// @route   DELETE /api/trainer/batches/:id OR DELETE /api/admin/batches/:id
// @access  Private
exports.deleteBatch = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Trainers can only delete their own batches; admins can delete any
        if (req.user.role === 'trainer' && batch.trainerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this batch' });
        }

        // Delete all students in this batch
        const deletedStudents = await Student.deleteMany({ batchId: batch._id });

        await logAudit(req, 'DELETE_BATCH', 'Batch', batch._id, batch.batchName,
            { studentsRemoved: deletedStudents.deletedCount });
        await batch.deleteOne();

        res.json({ success: true, message: `Batch and ${deletedStudents.deletedCount} student(s) removed successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
