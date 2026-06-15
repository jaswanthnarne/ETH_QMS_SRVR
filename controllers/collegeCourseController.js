const CollegeCourseMap = require('../models/CollegeCourseMap');
const TrainerCourseMap = require('../models/TrainerCourseMap');
const Course = require('../models/Course');
const User = require('../models/User');
const Batch = require('../models/Batch');
const { logAudit } = require('../utils/auditHelper');

// ==========================================
// COLLEGE ↔ COURSE MAPPING
// ==========================================

// @desc    Get all courses mapped to a college
// @route   GET /api/admin/colleges/:collegeId/mapped-courses
exports.getMappedCourses = async (req, res) => {
    try {
        const { collegeId } = req.params;
        const mappings = await CollegeCourseMap.find({ collegeId })
            .populate('courseId', 'name code description duration modulesCount program status')
            .populate('mappedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: mappings.length, data: mappings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Map a global course to a college
// @route   POST /api/admin/colleges/:collegeId/mapped-courses
exports.mapCourseToCollege = async (req, res) => {
    try {
        const { collegeId } = req.params;
        const { courseId, customDuration, startDate, endDate } = req.body;

        if (!courseId) {
            return res.status(400).json({ success: false, error: 'Course ID is required' });
        }

        // Verify the course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        // Check if already mapped
        const existing = await CollegeCourseMap.findOne({ collegeId, courseId });
        if (existing) {
            return res.status(400).json({ success: false, error: 'This course is already mapped to this college' });
        }

        const mapping = await CollegeCourseMap.create({
            collegeId,
            courseId,
            customDuration,
            startDate,
            endDate,
            mappedBy: req.user._id
        });

        const populated = await CollegeCourseMap.findById(mapping._id)
            .populate('courseId', 'name code description duration modulesCount program status')
            .populate('mappedBy', 'firstName lastName');

        await logAudit(req, 'MAP_COURSE_TO_COLLEGE', 'CollegeCourseMap', mapping._id, `${course.name} → College`);
        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'This course is already mapped to this college' });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Remove a course mapping from a college
// @route   DELETE /api/admin/colleges/:collegeId/mapped-courses/:mapId
exports.removeCourseMapping = async (req, res) => {
    try {
        const mapping = await CollegeCourseMap.findById(req.params.mapId);
        if (!mapping) {
            return res.status(404).json({ success: false, error: 'Mapping not found' });
        }

        // Check if there are active batches using this course at this college
        const activeBatches = await Batch.countDocuments({
            collegeId: mapping.collegeId,
            courseId: mapping.courseId,
            status: { $ne: 'completed' }
        });

        if (activeBatches > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot remove mapping — ${activeBatches} active batch(es) still use this course at this college`
            });
        }

        // Also remove all trainer mappings for this course at this college
        await TrainerCourseMap.deleteMany({
            collegeId: mapping.collegeId,
            courseId: mapping.courseId
        });

        await logAudit(req, 'UNMAP_COURSE_FROM_COLLEGE', 'CollegeCourseMap', mapping._id);
        await mapping.deleteOne();

        res.json({ success: true, message: 'Course unmapped from college successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// TRAINER ↔ COURSE MAPPING (at College Level)
// ==========================================

// @desc    Get trainers mapped to a specific course at a college
// @route   GET /api/admin/colleges/:collegeId/courses/:courseId/trainers
exports.getMappedTrainers = async (req, res) => {
    try {
        const { collegeId, courseId } = req.params;
        const mappings = await TrainerCourseMap.find({ collegeId, courseId, status: 'active' })
            .populate('trainerId', 'firstName lastName email phone employeeId program')
            .populate('assignedBy', 'firstName lastName')
            .sort({ assignedDate: -1 });

        // Also count active batches per trainer for this course
        const enriched = await Promise.all(mappings.map(async (m) => {
            const activeBatchCount = await Batch.countDocuments({
                trainerId: m.trainerId._id,
                collegeId,
                courseId,
                status: { $ne: 'completed' }
            });
            return {
                ...m.toObject(),
                activeBatchCount
            };
        }));

        res.json({ success: true, count: enriched.length, data: enriched });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Map a trainer to a course at a college
// @route   POST /api/admin/colleges/:collegeId/courses/:courseId/trainers
exports.mapTrainerToCourse = async (req, res) => {
    try {
        const { collegeId, courseId } = req.params;
        const { trainerId } = req.body;

        if (!trainerId) {
            return res.status(400).json({ success: false, error: 'Trainer ID is required' });
        }

        // Verify the trainer exists and is a trainer
        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(404).json({ success: false, error: 'Trainer not found' });
        }

        // Verify the course is mapped to this college
        const courseMapping = await CollegeCourseMap.findOne({ collegeId, courseId });
        if (!courseMapping) {
            return res.status(400).json({ success: false, error: 'This course is not mapped to this college' });
        }

        // Check if already mapped
        const existing = await TrainerCourseMap.findOne({ trainerId, collegeId, courseId });
        if (existing) {
            if (existing.status === 'relieved') {
                // Reactivate
                existing.status = 'active';
                existing.classroomLocation = req.body.classroomLocation || '';
                existing.assignedDate = new Date();
                existing.assignedBy = req.user._id;
                await existing.save();

                // Also update the trainer's assignedColleges and assignedCourses arrays for backward compat
                await User.findByIdAndUpdate(trainerId, {
                    $addToSet: {
                        assignedColleges: collegeId,
                        assignedCourses: courseId
                    }
                });

                const populated = await TrainerCourseMap.findById(existing._id)
                    .populate('trainerId', 'firstName lastName email phone employeeId program')
                    .populate('assignedBy', 'firstName lastName');

                return res.json({ success: true, data: populated, message: 'Trainer re-assigned to course' });
            }
            return res.status(400).json({ success: false, error: 'This trainer is already assigned to this course at this college' });
        }

        const mapping = await TrainerCourseMap.create({
            trainerId,
            collegeId,
            courseId,
            classroomLocation: req.body.classroomLocation || '',
            assignedBy: req.user._id
        });

        // Also update the trainer's assignedColleges and assignedCourses arrays for backward compat
        await User.findByIdAndUpdate(trainerId, {
            $addToSet: {
                assignedColleges: collegeId,
                assignedCourses: courseId
            }
        });

        const populated = await TrainerCourseMap.findById(mapping._id)
            .populate('trainerId', 'firstName lastName email phone employeeId program')
            .populate('assignedBy', 'firstName lastName');

        await logAudit(req, 'MAP_TRAINER_TO_COURSE', 'TrainerCourseMap', mapping._id,
            `${trainer.firstName} ${trainer.lastName} → Course at College`);

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'This trainer is already assigned to this course at this college' });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Remove a trainer mapping (relieve from course at college)
// @route   DELETE /api/admin/colleges/:collegeId/courses/:courseId/trainers/:mapId
exports.removeTrainerMapping = async (req, res) => {
    try {
        const mapping = await TrainerCourseMap.findById(req.params.mapId);
        if (!mapping) {
            return res.status(404).json({ success: false, error: 'Mapping not found' });
        }

        // Check if trainer has active batches for this course at this college
        const activeBatches = await Batch.countDocuments({
            trainerId: mapping.trainerId,
            collegeId: mapping.collegeId,
            courseId: mapping.courseId,
            status: { $ne: 'completed' }
        });

        if (activeBatches > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot relieve trainer — ${activeBatches} active batch(es) are still assigned to this trainer`
            });
        }

        // Soft-relieve instead of hard delete
        mapping.status = 'relieved';
        await mapping.save();

        await logAudit(req, 'UNMAP_TRAINER_FROM_COURSE', 'TrainerCourseMap', mapping._id);
        res.json({ success: true, message: 'Trainer relieved from course at college' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
