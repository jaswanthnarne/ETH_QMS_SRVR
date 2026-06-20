const College = require('../models/College');
const Course = require('../models/Course');
const User = require('../models/User');
const Exam = require('../models/Exam');
const TrainerExamKey = require('../models/TrainerExamKey');
const TrainerCourseMap = require('../models/TrainerCourseMap');
const Question = require('../models/Question');
const StudentAttempt = require('../models/StudentAttempt');
const TrainingLog = require('../models/TrainingLog');
const Batch = require('../models/Batch');
const CollegeCourseMap = require('../models/CollegeCourseMap');
const Student = require('../models/Student');

const crypto = require('crypto');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { logAudit } = require('../utils/auditHelper');
const cloudinary = require('cloudinary').v2;

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

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const emitDataUpdated = (req, resource, action, data = {}) => {
    try {
        const io = req.app?.get('socketio');
        if (!io) return;
        io.emit('data_updated', {
            resource,
            action,
            data,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Socket emit failed:', err.message);
    }
};

// --- College Controller ---
exports.getColleges = async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'college_admin') {
            filter = { _id: req.user.collegeId };
        } else if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
            ];
            filter = { _id: { $in: collegesList } };
        }
        const colleges = await College.find(filter);
        res.json({ success: true, count: colleges.length, data: colleges });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getCollegeById = async (req, res) => {
    try {
        const college = await College.findById(req.params.id);
        if (!college) return res.status(404).json({ success: false, error: 'College not found' });
        res.json({ success: true, data: college });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createCollege = async (req, res) => {
    try {
        const college = await College.create(req.body);
        await logAudit(req, 'CREATE_COLLEGE', 'College', college._id, college.name);
        emitDataUpdated(req, 'colleges', 'create', { id: college._id, name: college.name });
        res.status(201).json({ success: true, data: college });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.updateCollege = async (req, res) => {
    try {
        if (!checkCollegeScope(req.user, req.params.id)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }
        const college = await College.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!college) return res.status(404).json({ success: false, error: 'College not found' });
        await logAudit(req, 'UPDATE_COLLEGE', 'College', college._id, college.name);
        emitDataUpdated(req, 'colleges', 'update', { id: college._id, name: college.name });
        res.json({ success: true, data: college });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.deleteCollege = async (req, res) => {
    try {
        const college = await College.findById(req.params.id);
        if (!college) return res.status(404).json({ success: false, error: 'College not found' });
        
        if (req.user.role === 'trainer') {
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { assignedColleges: req.params.id }
            });
            if (req.user.collegeId?.toString() === req.params.id) {
                await User.findByIdAndUpdate(req.user._id, {
                    $unset: { collegeId: "" }
                });
            }
            return res.json({ success: true, message: 'College unassigned from trainer successfully' });
        }

        await Course.deleteMany({ collegeId: req.params.id });
        await logAudit(req, 'DELETE_COLLEGE', 'College', college._id, college.name);
        await college.deleteOne();
        
        res.json({ success: true, message: 'College and its courses deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.uploadCollegeLogo = async (req, res) => {
    try {
        if (!checkCollegeScope(req.user, req.params.id)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload an image file' });
        }

        const college = await College.findById(req.params.id);
        if (!college) {
            return res.status(404).json({ success: false, error: 'College not found' });
        }

        // Upload image to Cloudinary from memory buffer
        const uploadStream = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'college_logos',
                        transformation: [{ width: 250, height: 250, crop: 'limit' }]
                    },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );
                stream.end(req.file.buffer);
            });
        };

        const result = await uploadStream();

        // Save URL to database
        college.logoUrl = result.secure_url;
        await college.save();

        await logAudit(req, 'UPLOAD_COLLEGE_LOGO', 'College', college._id, college.name, { logoUrl: college.logoUrl });

        res.json({
            success: true,
            data: college,
            message: 'Logo uploaded successfully'
        });
    } catch (error) {
        console.error('Logo upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Course Controller ---
exports.getCourses = async (req, res) => {
    try {
        let collegeId = req.params.collegeId || req.query.collegeId;
        
        if (req.user.role === 'college_admin' && req.query.global !== 'true') {
            collegeId = req.user.collegeId;
        } else if (req.user.role === 'trainer') {
            if (collegeId) {
                const collegesList = [
                    ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                    ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
                ];
                if (!collegesList.includes(collegeId.toString())) {
                    return res.status(403).json({ success: false, error: 'Not authorized to access courses for this college' });
                }
            }
        }

        let courses = [];
        if (collegeId) {
            // Find courses created directly for this college
            const directCourses = await Course.find({ collegeId })
                .populate('collegeId', 'name')
                .populate('createdBy', 'firstName lastName username role');

            // Find courses mapped via CollegeCourseMap
            const mappings = await CollegeCourseMap.find({ collegeId })
                .populate({
                    path: 'courseId',
                    populate: [
                        { path: 'collegeId', select: 'name' },
                        { path: 'createdBy', select: 'firstName lastName username role' }
                    ]
                });
            const mappedCourses = mappings.map(m => m.courseId).filter(Boolean);

            // Merge and de-duplicate
            const courseMap = new Map();
            directCourses.forEach(c => courseMap.set(c._id.toString(), c));
            mappedCourses.forEach(c => courseMap.set(c._id.toString(), c));
            courses = Array.from(courseMap.values());
        } else {
            if (req.user.role === 'trainer') {
                const collegesList = [
                    ...(req.user.collegeId ? [req.user.collegeId] : []),
                    ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
                ];
                // Fetch mapped courses for their colleges
                const mappings = await CollegeCourseMap.find({ collegeId: { $in: collegesList } }).select('courseId');
                const collegeCourseIds = mappings.map(m => m.courseId);

                // Filter by assignedCourses OR courses mapped to their colleges
                const trainerCoursesFilter = {
                    $or: [
                        { _id: { $in: req.user.assignedCourses || [] } },
                        { _id: { $in: collegeCourseIds } },
                        { collegeId: { $in: collegesList } }
                    ]
                };

                courses = await Course.find(trainerCoursesFilter)
                    .populate('collegeId', 'name')
                    .populate('createdBy', 'firstName lastName username role');
            } else {
                courses = await Course.find({})
                    .populate('collegeId', 'name')
                    .populate('createdBy', 'firstName lastName username role');
            }
        }

        res.json({ success: true, count: courses.length, data: courses });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createCourse = async (req, res) => {
    try {
        let collegeId = req.body.collegeId || req.params.collegeId;
        if (req.user.role === 'college_admin') {
            collegeId = req.user.collegeId;
        }

        if (collegeId && !checkCollegeScope(req.user, collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        const courseData = { 
            ...req.body, 
            createdBy: req.user._id 
        };
        
        if (collegeId) {
            courseData.collegeId = collegeId;
        }

        const course = await Course.create(courseData);
        
        if (req.user.role === 'trainer') {
            await User.findByIdAndUpdate(req.user._id, {
                $push: { assignedCourses: course._id }
            });
        }

        emitDataUpdated(req, 'courses', 'create', { id: course._id, name: course.name, collegeId: course.collegeId });
        res.status(201).json({ success: true, data: course });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const courseCheck = await Course.findById(req.params.id);
        if (courseCheck && courseCheck.collegeId && !checkCollegeScope(req.user, courseCheck.collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        emitDataUpdated(req, 'courses', 'update', { id: course._id, name: course.name, collegeId: course.collegeId });
        res.json({ success: true, data: course });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        
        if (req.user.role === 'trainer') {
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { assignedCourses: req.params.id }
            });
            return res.json({ success: true, message: 'Course unassigned from trainer successfully' });
        }

        // Unset courseId from exams associated with this course so they are NOT deleted
        await Exam.updateMany({ courseId: req.params.id }, { $unset: { courseId: "" } });
        await course.deleteOne();
        emitDataUpdated(req, 'courses', 'delete', { id: req.params.id });
        res.json({ success: true, message: 'Course deleted successfully (associated exams were preserved)' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Trainer Controller ---
exports.getTrainers = async (req, res) => {
    try {
        let collegeId = req.query.collegeId || req.user.collegeId;
        let filter = { role: 'trainer' };

        if (collegeId) {
            filter.$or = [
                { collegeId: collegeId },
                { assignedColleges: collegeId }
            ];
        }

        const trainersList = await User.find(filter)
            .select('-password')
            .populate('collegeId', 'name')
            .populate('assignedColleges', 'name')
            .populate('assignedCourses', 'name code')
            .lean();

        // Perform a single aggregate lookup to count all trainer attempts
        const trainerIds = trainersList.map(t => t._id);
        const attemptCounts = await StudentAttempt.aggregate([
            { $match: { trainerId: { $in: trainerIds } } },
            { $group: { _id: '$trainerId', count: { $sum: 1 } } }
        ]);

        // Map aggregated counts to a fast lookup object
        const countMap = {};
        attemptCounts.forEach(item => {
            if (item._id) {
                countMap[item._id.toString()] = item.count;
            }
        });

        // Query active trainer-course mappings for this college to scope assignedCourses
        let activeMappings = [];
        if (collegeId) {
            activeMappings = await TrainerCourseMap.find({
                collegeId: collegeId,
                status: 'active'
            });
        }

        const trainers = trainersList.map(t => {
            let coursesForThisCollege = t.assignedCourses || [];
            if (collegeId) {
                const mappingsForTrainer = activeMappings.filter(m => m.trainerId?.toString() === t._id.toString());
                const mappedCourseIds = mappingsForTrainer.map(m => m.courseId?.toString());
                coursesForThisCollege = coursesForThisCollege
                    .filter(c => mappedCourseIds.includes(c._id?.toString() || c.toString()))
                    .map(c => {
                        const mObj = mappingsForTrainer.find(m => m.courseId?.toString() === (c._id || c).toString());
                        return {
                            ...c,
                            classroomLocation: mObj ? mObj.classroomLocation : ''
                        };
                    });
            }
            return {
                ...t,
                assignedCourses: coursesForThisCollege,
                testsCount: countMap[t._id.toString()] || 0
            };
        });
            
        res.json({ success: true, count: trainers.length, data: trainers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createTrainer = async (req, res) => {
    try {
        let { password, collegeId, assignedColleges, assignedCourses, firstName, lastName, phone, employeeId, classroomLocation } = req.body;
        
        if (req.user.role === 'college_admin') {
            collegeId = req.user.collegeId;
        }

        if (collegeId && !checkCollegeScope(req.user, collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }
        if (Array.isArray(assignedColleges)) {
            for (const col of assignedColleges) {
                if (!checkCollegeScope(req.user, col)) {
                    return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
                }
            }
        }

        if (!phone) return res.status(400).json({ success: false, error: 'Mobile number is required' });
        if (!password) return res.status(400).json({ success: false, error: 'Password is required' });

        const existing = await User.findOne({ phone, role: 'trainer' }).populate('collegeId', 'name');
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'A trainer with this mobile number already exists',
                existingTrainer: {
                    _id: existing._id,
                    firstName: existing.firstName,
                    lastName: existing.lastName,
                    phone: existing.phone,
                    employeeId: existing.employeeId,
                    collegeId: existing.collegeId?._id || existing.collegeId,
                    collegeName: existing.collegeId?.name || 'Global / Unrestricted',
                    assignedColleges: existing.assignedColleges || []
                }
            });
        }

        if (employeeId) {
            const existingEmp = await User.findOne({ employeeId }).populate('collegeId', 'name');
            if (existingEmp) {
                return res.status(400).json({
                    success: false,
                    error: 'A trainer with this Employee ID already exists',
                    existingTrainer: {
                        _id: existingEmp._id,
                        firstName: existingEmp.firstName,
                        lastName: existingEmp.lastName,
                        phone: existingEmp.phone,
                        employeeId: existingEmp.employeeId,
                        collegeId: existingEmp.collegeId?._id || existingEmp.collegeId,
                        collegeName: existingEmp.collegeId?.name || 'Global / Unrestricted',
                        assignedColleges: existingEmp.assignedColleges || []
                    }
                });
            }
        }

        const classroomLocations = [];
        if (collegeId && classroomLocation) {
            classroomLocations.push({ collegeId, location: classroomLocation });
        }

        const trainer = await User.create({
            firstName,
            lastName,
            phone,
            employeeId: employeeId || undefined,
            password,
            role: 'trainer',
            collegeId: collegeId || null,
            assignedColleges: assignedColleges || [],
            assignedCourses: assignedCourses || [],
            classroomLocations: [],
            username: employeeId || phone // Default to employeeId, fallback to phone
        });

        // Create TrainerCourseMap entries for the initial courses assigned to them
        if (trainer && collegeId && assignedCourses && assignedCourses.length > 0) {
            const courseLocations = req.body.courseLocations || {};
            for (const courseId of assignedCourses) {
                const cloc = courseLocations[courseId] || '';
                await TrainerCourseMap.create({
                    trainerId: trainer._id,
                    collegeId: collegeId,
                    courseId: courseId,
                    classroomLocation: cloc,
                    assignedBy: req.user._id
                });
            }
        }

        await logAudit(req, 'CREATE_TRAINER', 'User', trainer._id, `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone);
        emitDataUpdated(req, 'trainers', 'create', { id: trainer._id, name: `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone });
        res.status(201).json({ success: true, data: trainer });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.updateTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const trainerCheck = await User.findById(id);
        if (!trainerCheck) return res.status(404).json({ success: false, error: 'Trainer not found' });
        
        if (['regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
            ].map(id => id.toString());
            
            const trainerColleges = [
                ...(trainerCheck.collegeId ? [trainerCheck.collegeId] : []),
                ...(Array.isArray(trainerCheck.assignedColleges) ? trainerCheck.assignedColleges : [])
            ].map(id => id.toString());
            
            const hasIntersection = trainerColleges.some(c => collegesList.includes(c));
            if (!hasIntersection) {
                return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
            }
        }

        const updateData = { ...req.body };
        delete updateData.role; // Never change role here
        if (updateData.collegeId === "" || updateData.collegeId === null) {
            updateData.collegeId = null;
        } else if (!updateData.collegeId) {
            delete updateData.collegeId;
        } else {
            if (!checkCollegeScope(req.user, updateData.collegeId)) {
                return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
            }
        }

        if (Array.isArray(updateData.assignedColleges)) {
            for (const col of updateData.assignedColleges) {
                if (!checkCollegeScope(req.user, col)) {
                    return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
                }
            }
        }

        // If phone changed, update username fallback
        if (updateData.phone && !updateData.employeeId) updateData.username = updateData.phone;
        
        if (updateData.employeeId) {
            const existingEmp = await User.findOne({ employeeId: updateData.employeeId, _id: { $ne: id } });
            if (existingEmp) return res.status(400).json({ success: false, error: 'A trainer with this Employee ID already exists' });
            updateData.username = updateData.employeeId;
        }

        if (updateData.classroomLocation !== undefined) {
            const targetCollegeId = req.query.collegeId || (req.user.role === 'college_admin' ? req.user.collegeId : req.body.collegeId);
            if (targetCollegeId) {
                const trainerToUpdate = await User.findById(id);
                if (trainerToUpdate) {
                    let locs = trainerToUpdate.classroomLocations || [];
                    const index = locs.findIndex(l => l.collegeId?.toString() === targetCollegeId.toString());
                    if (updateData.classroomLocation === "") {
                        if (index >= 0) locs.splice(index, 1);
                    } else {
                        if (index >= 0) {
                            locs[index].location = updateData.classroomLocation;
                        } else {
                            locs.push({ collegeId: targetCollegeId, location: updateData.classroomLocation });
                        }
                    }
                    updateData.classroomLocations = locs;
                }
            }
            delete updateData.classroomLocation;
        }

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        } else {
            delete updateData.password;
        }

        const targetCollegeId = req.query.collegeId || (req.user.role === 'college_admin' ? req.user.collegeId : req.body.collegeId);

        if (targetCollegeId && updateData.assignedCourses) {
            // Find all courses mapped to this college
            const mappedCourses = await CollegeCourseMap.find({ collegeId: targetCollegeId });
            const collegeCourseIds = mappedCourses.map(m => m.courseId.toString());

            // The checked courses for this college sent from the frontend
            const checkedLocalCourses = updateData.assignedCourses.map(c => c.toString());
            // The unchecked courses for this college
            const uncheckedLocalCourses = collegeCourseIds.filter(cid => !checkedLocalCourses.includes(cid));

            // The courseLocations object sent from the frontend
            const courseLocations = req.body.courseLocations || {};

            // 1. Upsert checked courses into TrainerCourseMap
            for (const courseId of checkedLocalCourses) {
                const cloc = courseLocations[courseId] || '';
                await TrainerCourseMap.findOneAndUpdate(
                    { trainerId: id, collegeId: targetCollegeId, courseId },
                    { 
                        status: 'active', 
                        assignedDate: new Date(), 
                        assignedBy: req.user._id,
                        classroomLocation: cloc
                    },
                    { upsert: true }
                );
            }

            // 2. Delete unchecked courses from TrainerCourseMap
            if (uncheckedLocalCourses.length > 0) {
                await TrainerCourseMap.deleteMany({
                    trainerId: id,
                    collegeId: targetCollegeId,
                    courseId: { $in: uncheckedLocalCourses }
                });
            }

            // 3. Re-calculate global assignedCourses based on all TrainerCourseMap entries
            const allActiveMaps = await TrainerCourseMap.find({ trainerId: id, status: 'active' });
            const activeCourses = [...new Set(allActiveMaps.map(m => m.courseId.toString()))];
            updateData.assignedCourses = activeCourses;

            // 4. Update assignedColleges list
            const oldTrainerDoc = await User.findById(id);
            if (oldTrainerDoc) {
                let updatedColleges = oldTrainerDoc.assignedColleges?.map(c => c.toString()) || [];
                if (checkedLocalCourses.length > 0) {
                    if (oldTrainerDoc.collegeId?.toString() !== targetCollegeId.toString()) {
                        if (!updatedColleges.includes(targetCollegeId.toString())) {
                            updatedColleges.push(targetCollegeId.toString());
                        }
                    }
                } else {
                    updatedColleges = updatedColleges.filter(c => c !== targetCollegeId.toString());
                }
                updateData.assignedColleges = updatedColleges;
            }
            
            // Clean up properties that shouldn't be saved directly on the User model
            delete updateData.courseLocations;
        } else if (updateData.assignedColleges || updateData.assignedCourses) {
            // If assignedColleges or assignedCourses are updated globally (e.g. from global dashboard), sync with TrainerCourseMap
            const oldTrainer = await User.findById(id);
            if (oldTrainer) {
                const oldColleges = oldTrainer.assignedColleges?.map(c => c.toString()) || [];
                const oldCourses = oldTrainer.assignedCourses?.map(c => c.toString()) || [];

                if (updateData.assignedColleges) {
                    const newColleges = updateData.assignedColleges.map(c => c.toString());
                    const removedColleges = oldColleges.filter(c => !newColleges.includes(c));
                    if (removedColleges.length > 0) {
                        await TrainerCourseMap.deleteMany({
                            trainerId: id,
                            collegeId: { $in: removedColleges }
                        });
                    }
                }

                if (updateData.assignedCourses) {
                    const newCourses = updateData.assignedCourses.map(c => c.toString());
                    const removedCourses = oldCourses.filter(c => !newCourses.includes(c));
                    if (removedCourses.length > 0) {
                        await TrainerCourseMap.deleteMany({
                            trainerId: id,
                            courseId: { $in: removedCourses }
                        });
                    }
                }
            }
        }

        const trainer = await User.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: false
        }).select('-password').populate('collegeId', 'name').populate('assignedCourses', 'name code');

        if (!trainer) return res.status(404).json({ success: false, error: 'Trainer not found' });

        emitDataUpdated(req, 'trainers', 'update', { id: trainer._id, name: `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone });
        res.json({ success: true, data: trainer });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.deleteTrainer = async (req, res) => {
    try {
        const trainer = await User.findById(req.params.id);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(404).json({ success: false, error: 'Trainer not found' });
        }
        
        await logAudit(req, 'DELETE_TRAINER', 'User', trainer._id, `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone);
        await TrainerCourseMap.deleteMany({ trainerId: trainer._id });
        await trainer.deleteOne();
        emitDataUpdated(req, 'trainers', 'delete', { id: trainer._id });
        res.json({ success: true, message: 'Trainer access revoked' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.uploadTrainerPdf = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload a PDF file' });
        }

        const trainer = await User.findById(req.params.id);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(404).json({ success: false, error: 'Trainer not found' });
        }

        const uploadStream = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'trainer_details_pdfs',
                        resource_type: 'raw'
                    },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );
                stream.end(req.file.buffer);
            });
        };

        const result = await uploadStream();

        // Save URL to database
        trainer.pdfUrl = result.secure_url;
        await trainer.save();

        await logAudit(req, 'UPLOAD_TRAINER_PDF', 'User', trainer._id, `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone, { pdfUrl: trainer.pdfUrl });
        emitDataUpdated(req, 'trainers', 'update', { id: trainer._id, name: `${trainer.firstName} ${trainer.lastName}`.trim() || trainer.phone });

        res.json({
            success: true,
            data: trainer,
            message: 'PDF uploaded successfully'
        });
    } catch (error) {
        console.error('Trainer PDF upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const https = require('https');

exports.downloadTrainerPdf = async (req, res) => {
    try {
        const trainer = await User.findById(req.params.id);
        if (!trainer || !trainer.pdfUrl) {
            return res.status(404).json({ success: false, error: 'PDF not found' });
        }

        https.get(trainer.pdfUrl, (response) => {
            if (response.statusCode >= 400) {
                return res.status(response.statusCode).json({ success: false, error: 'Failed to retrieve PDF from storage' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="trainer_details.pdf"');
            response.pipe(res);
        }).on('error', (error) => {
            console.error('Error downloading trainer PDF:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve PDF file' });
        });
    } catch (error) {
        console.error('Error fetching trainer for PDF download:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

exports.uploadCourseSyllabus = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload a PDF file' });
        }

        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        // Upload PDF to Cloudinary as raw resource type
        const uploadStream = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'course_syllabi',
                        resource_type: 'raw'
                    },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );
                stream.end(req.file.buffer);
            });
        };

        const result = await uploadStream();

        // Save URL to database
        course.syllabusUrl = result.secure_url;
        await course.save();

        await logAudit(req, 'UPLOAD_COURSE_SYLLABUS', 'Course', course._id, course.name, { syllabusUrl: course.syllabusUrl });
        emitDataUpdated(req, 'courses', 'update', { id: course._id, name: course.name });

        res.json({
            success: true,
            data: course,
            message: 'Syllabus PDF uploaded successfully'
        });
    } catch (error) {
        console.error('Course syllabus upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.downloadCourseSyllabus = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course || !course.syllabusUrl) {
            return res.status(404).json({ success: false, error: 'Syllabus PDF not found' });
        }

        https.get(course.syllabusUrl, (response) => {
            if (response.statusCode >= 400) {
                return res.status(response.statusCode).json({ success: false, error: 'Failed to retrieve Syllabus from storage' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="course_syllabus.pdf"');
            response.pipe(res);
        }).on('error', (error) => {
            console.error('Error downloading course syllabus:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve Syllabus file' });
        });
    } catch (error) {
        console.error('Error fetching course for syllabus download:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// --- Exam Controller ---
exports.createExam = async (req, res) => {
    try {
        const { 
            collegeId, courseId, title, department, description, duration, 
            totalMarks, passingMarks, instructions, settings, questions, batches
        } = req.body;

        if (collegeId && !checkCollegeScope(req.user, collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        // 1. Create the Exam
        const exam = await Exam.create({
            collegeId, courseId, title, department: department || '', description, duration, 
            totalMarks, passingPercentage: req.body.passingPercentage || 40, instructions,
            batches: batches || [],
            scheduledDate: req.body.scheduledDate || Date.now(),
            expiryDate: req.body.expiryDate || null,
            settings: {
                ...settings,
                // Ensure defaults for critical fields if not provided
                shuffleQuestions: settings?.shuffleQuestions ?? false,
                showResultImmediately: settings?.showResultImmediately ?? true,
                allowReview: settings?.allowReview ?? true,
                collectEmail: settings?.collectEmail ?? false,
                collectMobile: settings?.collectMobile ?? true,
                collectDepartment: settings?.collectDepartment ?? true,
                enableCertificate: settings?.enableCertificate ?? false,
                enableSections: settings?.enableSections ?? false
            },
            createdBy: req.user._id
        });

        // 2. Create Questions (handle all 5 types)
        if (questions && questions.length > 0) {
            const questionData = questions.map((q, index) => {
                const qType = q.type || 'single_correct';
                let choices = [];
                let correctAnswerText = null;

                if (qType === 'single_correct' || qType === 'mcq') {
                    choices = (q.options || []).map((opt, i) => ({
                        id: `opt_${i}`, text: opt,
                        isCorrect: opt === q.correctAnswer
                    }));
                } else if (qType === 'multiple_correct' || qType === 'multiple') {
                    const correctArr = Array.isArray(q.correctAnswers) ? q.correctAnswers : JSON.parse(q.correctAnswer || '[]');
                    choices = (q.options || []).map((opt, i) => ({
                        id: `opt_${i}`, text: opt,
                        isCorrect: correctArr.includes(opt)
                    }));
                } else if (qType === 'true_false') {
                    choices = ['True', 'False'].map((opt, i) => ({
                        id: `opt_${i}`, text: opt,
                        isCorrect: opt === q.correctAnswer
                    }));
                } else if (qType === 'fill_blank' || qType === 'fill_blanks') {
                    correctAnswerText = q.correctAnswer?.toString() || '';
                } else if (qType === 'numeric') {
                    correctAnswerText = q.correctAnswer?.toString() || '';
                }

                return {
                    examId: exam._id,
                    type: qType,
                    text: q.text,
                    points: q.marks || 1,
                    order: index,
                    correctAnswerText,
                    options: { choices }
                };
            });

                await Question.insertMany(questionData);
        }

        await logAudit(req, 'CREATE_EXAM', 'Exam', exam._id, exam.title);
        emitDataUpdated(req, 'exams', 'create', { id: exam._id, title: exam.title, status: exam.status });
        res.status(201).json({ success: true, data: exam });
    } catch (error) {
        console.error('Create Exam Error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.getExams = async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'college_admin') {
            filter.collegeId = req.user.collegeId;
        } else if (req.user.role === 'trainer') {
            filter.createdBy = req.user._id;
        } else if (req.query.collegeId) {
            filter.collegeId = req.query.collegeId;
        }

        const exams = await Exam.find(filter).populate('courseId', 'name code').populate('collegeId', 'name');
        res.json({ success: true, count: exams.length, data: exams });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getExamById = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
        const questions = await Question.find({ examId: exam._id });
        res.json({ success: true, data: { exam, questions } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        
        let exam = await Exam.findById(id);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        if (exam.collegeId && !checkCollegeScope(req.user, exam.collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        if (payload.collegeId && !checkCollegeScope(req.user, payload.collegeId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Action out of assigned regional scope' });
        }

        if (req.user.role === 'trainer' && exam.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this exam' });
        }

        exam.title = payload.title;
        exam.collegeId = payload.collegeId;
        exam.courseId = payload.courseId;
        exam.batches = payload.batches || [];
        exam.department = payload.department;
        exam.duration = payload.duration;
        exam.totalMarks = payload.totalMarks;
        exam.passingPercentage = payload.passingPercentage || 40;
        exam.instructions = payload.instructions;
        exam.scheduledDate = payload.scheduledDate || exam.scheduledDate;
        exam.expiryDate = payload.expiryDate || null;
        if (payload.settings) {
            exam.settings = { ...exam.settings.toObject(), ...payload.settings };
            exam.markModified('settings');
        }
        await exam.save();

        if (payload.questions && Array.isArray(payload.questions)) {
            await Question.deleteMany({ examId: exam._id });
            const questionData = payload.questions.map((q, index) => {
                const qType = q.type || 'single_correct';
                let choices = []; let correctAnswerText = null;

                if (qType === 'single_correct' || qType === 'mcq') {
                    choices = (q.options || []).map((opt, i) => ({ id: `opt_${i}`, text: opt, isCorrect: opt === q.correctAnswer }));
                } else if (qType === 'multiple_correct' || qType === 'multiple') {
                    const correctArr = Array.isArray(q.correctAnswers) ? q.correctAnswers : JSON.parse(q.correctAnswer || '[]');
                    choices = (q.options || []).map((opt, i) => ({ id: `opt_${i}`, text: opt, isCorrect: correctArr.includes(opt) }));
                } else if (qType === 'true_false') {
                    choices = ['True', 'False'].map((opt, i) => ({ id: `opt_${i}`, text: opt, isCorrect: opt === q.correctAnswer }));
                } else if (qType === 'fill_blank' || qType === 'fill_blanks') {
                    correctAnswerText = q.correctAnswer?.toString() || '';
                } else if (qType === 'numeric') {
                    correctAnswerText = q.correctAnswer?.toString() || '';
                }
                return { examId: exam._id, type: qType, text: q.text, points: q.marks || 1, order: index, correctAnswerText, options: { choices } };
            });
            await Question.insertMany(questionData);
        }

        emitDataUpdated(req, 'exams', 'update', { id: exam._id, title: exam.title, status: exam.status });
        res.json({ success: true, message: 'Exam updated successfully', data: exam });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.deleteExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
        
        if (req.user.role === 'trainer' && exam.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this exam' });
        }
        
        await Question.deleteMany({ examId: req.params.id });
        await TrainerExamKey.deleteMany({ examId: req.params.id });
        await StudentAttempt.deleteMany({ examId: req.params.id });
        await logAudit(req, 'DELETE_EXAM', 'Exam', exam._id, exam.title);
        await exam.deleteOne();
        emitDataUpdated(req, 'exams', 'delete', { id: exam._id });
        res.json({ success: true, message: 'Exam and all associated data purged' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Bulk Question Import via Excel ---
exports.bulkImportQuestions = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        const { examId } = req.body;
        if (!examId) return res.status(400).json({ success: false, error: 'examId is required' });

        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];

        const questions = [];
        const errors = [];
        const existingQuestionCount = await Question.countDocuments({ examId });
        let questionOrder = existingQuestionCount + 1;

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header

            const text = row.getCell(1).value?.toString()?.trim();
            const type = row.getCell(2).value?.toString()?.trim()?.toLowerCase() || 'single_correct';
            const optA = row.getCell(3).value?.toString()?.trim();
            const optB = row.getCell(4).value?.toString()?.trim();
            const optC = row.getCell(5).value?.toString()?.trim();
            const optD = row.getCell(6).value?.toString()?.trim();
            const correctAnswer = row.getCell(7).value?.toString()?.trim();
            const marks = parseFloat(row.getCell(8).value) || 1;
            const difficulty = row.getCell(9).value?.toString()?.trim()?.toLowerCase() || 'medium';

            // Skip entirely blank trailing rows silently
            if (!text && !correctAnswer && !optA && !optB) {
                return;
            }

            if (!text) {
                errors.push({ row: rowNumber, error: 'Question text is missing' });
                return;
            }
            if (!correctAnswer) {
                errors.push({ row: rowNumber, error: 'Correct answer is missing' });
                return;
            }

            const allOptions = [optA, optB, optC, optD].filter(Boolean);
            let choices = [];
            let correctAnswerText = null;

            const normalizedType = ['single_correct','mcq', 'single'].includes(type) ? 'single_correct'
                : ['multiple_correct','multiple'].includes(type) ? 'multiple_correct'
                : ['true_false', 'tf', 'true/false'].includes(type) ? 'true_false'
                : ['fill_blank','fill_blanks', 'fib'].includes(type) ? 'fill_blank'
                : ['numeric', 'number'].includes(type) ? 'numeric'
                : 'single_correct';

            if (normalizedType === 'single_correct' || normalizedType === 'multiple_correct') {
                if (allOptions.length < 2) {
                    errors.push({ row: rowNumber, error: 'MCQ questions require at least 2 options' });
                    return;
                }
                
                if (normalizedType === 'single_correct') {
                    let correctAnswerIndex = -1;
                    const normAns = correctAnswer.trim().toUpperCase();
                    if (normAns === 'A' || normAns === 'OPTION A') correctAnswerIndex = 0;
                    else if (normAns === 'B' || normAns === 'OPTION B') correctAnswerIndex = 1;
                    else if (normAns === 'C' || normAns === 'OPTION C') correctAnswerIndex = 2;
                    else if (normAns === 'D' || normAns === 'OPTION D') correctAnswerIndex = 3;
                    else {
                        correctAnswerIndex = allOptions.findIndex(opt => opt.toLowerCase() === correctAnswer.toLowerCase());
                    }

                    if (correctAnswerIndex === -1 || correctAnswerIndex >= allOptions.length) {
                        errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" must match one of the provided options or option letters (A-D)` });
                        return;
                    }
                    choices = allOptions.map((opt, i) => ({
                        id: `opt_${i}`,
                        text: opt,
                        isCorrect: i === correctAnswerIndex
                    }));
                } else {
                    // multiple_correct
                    const correctParts = correctAnswer.split(',').map(s => s.trim().toUpperCase());
                    const correctIndices = [];
                    
                    correctParts.forEach(part => {
                        let idx = -1;
                        if (part === 'A' || part === 'OPTION A') idx = 0;
                        else if (part === 'B' || part === 'OPTION B') idx = 1;
                        else if (part === 'C' || part === 'OPTION C') idx = 2;
                        else if (part === 'D' || part === 'OPTION D') idx = 3;
                        else {
                            idx = allOptions.findIndex(opt => opt.toLowerCase() === part.toLowerCase());
                        }
                        if (idx >= 0 && idx < allOptions.length) {
                            correctIndices.push(idx);
                        }
                    });

                    if (correctIndices.length === 0) {
                        errors.push({ row: rowNumber, error: `Correct answers "${correctAnswer}" must match at least one option or option letters (A-D)` });
                        return;
                    }
                    choices = allOptions.map((opt, i) => ({
                        id: `opt_${i}`,
                        text: opt,
                        isCorrect: correctIndices.includes(i)
                    }));
                }
            } else if (normalizedType === 'true_false') {
                let tfAnswer = '';
                const normTF = correctAnswer.trim().toLowerCase();
                if (normTF === 'true' || normTF === 't' || normTF === 'a') tfAnswer = 'True';
                else if (normTF === 'false' || normTF === 'f' || normTF === 'b') tfAnswer = 'False';
                else {
                    errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" must be 'True' or 'False'` });
                    return;
                }
                choices = [
                    { id: 'opt_0', text: 'True', isCorrect: tfAnswer === 'True' },
                    { id: 'opt_1', text: 'False', isCorrect: tfAnswer === 'False' }
                ];
            } else if (normalizedType === 'numeric') {
                const numVal = parseFloat(correctAnswer);
                if (isNaN(numVal)) {
                    errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" is not a valid number` });
                    return;
                }
                correctAnswerText = numVal.toString();
            } else {
                correctAnswerText = correctAnswer;
            }

            questions.push({
                examId,
                type: normalizedType,
                text,
                points: marks,
                metadata: {
                    difficulty: ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium'
                },
                order: questionOrder++,
                correctAnswerText,
                options: { choices }
            });
        });

        if (questions.length > 0) {
            await Question.insertMany(questions);
            
            // Re-calculate and update totalMarks on the Exam
            const allExamQuestions = await Question.find({ examId });
            exam.totalMarks = allExamQuestions.reduce((sum, q) => sum + (q.points || 0), 0);
            await exam.save();

            await logAudit(req, 'BULK_IMPORT_QUESTIONS', 'Exam', exam._id, exam.title, { count: questions.length });
        }

        res.json({
            success: true,
            message: `Imported ${questions.length} question(s) successfully.`,
            imported: questions.length,
            errors
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Parse Questions Excel without saving ---
exports.parseQuestionsExcel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];

        const questions = [];
        const errors = [];
        let tempId = Date.now();

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header

            const text = row.getCell(1).value?.toString()?.trim();
            const type = row.getCell(2).value?.toString()?.trim()?.toLowerCase() || 'single_correct';
            const optA = row.getCell(3).value?.toString()?.trim();
            const optB = row.getCell(4).value?.toString()?.trim();
            const optC = row.getCell(5).value?.toString()?.trim();
            const optD = row.getCell(6).value?.toString()?.trim();
            const correctAnswer = row.getCell(7).value?.toString()?.trim();
            const marks = parseFloat(row.getCell(8).value) || 5; // Default marks to 5 in frontend
            const difficulty = row.getCell(9).value?.toString()?.trim()?.toLowerCase() || 'medium';

            // Skip entirely blank trailing rows silently
            if (!text && !correctAnswer && !optA && !optB) {
                return;
            }

            if (!text) {
                errors.push({ row: rowNumber, error: 'Question text is missing' });
                return;
            }
            if (!correctAnswer) {
                errors.push({ row: rowNumber, error: 'Correct answer is missing' });
                return;
            }

            const allOptions = [optA, optB, optC, optD].filter(Boolean);
            let choices = [];
            let correctAnswerText = null;

            const normalizedType = ['single_correct','mcq', 'single'].includes(type) ? 'single_correct'
                : ['multiple_correct','multiple'].includes(type) ? 'multiple_correct'
                : ['true_false', 'tf', 'true/false'].includes(type) ? 'true_false'
                : ['fill_blank','fill_blanks', 'fib'].includes(type) ? 'fill_blank'
                : ['numeric', 'number'].includes(type) ? 'numeric'
                : 'single_correct';

            if (normalizedType === 'single_correct' || normalizedType === 'multiple_correct') {
                if (allOptions.length < 2) {
                    errors.push({ row: rowNumber, error: 'MCQ questions require at least 2 options' });
                    return;
                }
                
                if (normalizedType === 'single_correct') {
                    let correctAnswerIndex = -1;
                    const normAns = correctAnswer.trim().toUpperCase();
                    if (normAns === 'A' || normAns === 'OPTION A') correctAnswerIndex = 0;
                    else if (normAns === 'B' || normAns === 'OPTION B') correctAnswerIndex = 1;
                    else if (normAns === 'C' || normAns === 'OPTION C') correctAnswerIndex = 2;
                    else if (normAns === 'D' || normAns === 'OPTION D') correctAnswerIndex = 3;
                    else {
                        correctAnswerIndex = allOptions.findIndex(opt => opt.toLowerCase() === correctAnswer.toLowerCase());
                    }

                    if (correctAnswerIndex === -1 || correctAnswerIndex >= allOptions.length) {
                        errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" must match one of the provided options or option letters (A-D)` });
                        return;
                    }
                    choices = allOptions.map((opt, i) => ({
                        id: `opt_${i}`,
                        text: opt,
                        isCorrect: i === correctAnswerIndex
                    }));
                } else {
                    // multiple_correct
                    const correctParts = correctAnswer.split(',').map(s => s.trim().toUpperCase());
                    const correctIndices = [];
                    
                    correctParts.forEach(part => {
                        let idx = -1;
                        if (part === 'A' || part === 'OPTION A') idx = 0;
                        else if (part === 'B' || part === 'OPTION B') idx = 1;
                        else if (part === 'C' || part === 'OPTION C') idx = 2;
                        else if (part === 'D' || part === 'OPTION D') idx = 3;
                        else {
                            idx = allOptions.findIndex(opt => opt.toLowerCase() === part.toLowerCase());
                        }
                        if (idx >= 0 && idx < allOptions.length) {
                            correctIndices.push(idx);
                        }
                    });

                    if (correctIndices.length === 0) {
                        errors.push({ row: rowNumber, error: `Correct answers "${correctAnswer}" must match at least one option or option letters (A-D)` });
                        return;
                    }
                    choices = allOptions.map((opt, i) => ({
                        id: `opt_${i}`,
                        text: opt,
                        isCorrect: correctIndices.includes(i)
                    }));
                }
            } else if (normalizedType === 'true_false') {
                let tfAnswer = '';
                const normTF = correctAnswer.trim().toLowerCase();
                if (normTF === 'true' || normTF === 't' || normTF === 'a') tfAnswer = 'True';
                else if (normTF === 'false' || normTF === 'f' || normTF === 'b') tfAnswer = 'False';
                else {
                    errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" must be 'True' or 'False'` });
                    return;
                }
                choices = [
                    { id: 'opt_0', text: 'True', isCorrect: tfAnswer === 'True' },
                    { id: 'opt_1', text: 'False', isCorrect: tfAnswer === 'False' }
                ];
            } else if (normalizedType === 'numeric') {
                const numVal = parseFloat(correctAnswer);
                if (isNaN(numVal)) {
                    errors.push({ row: rowNumber, error: `Correct answer "${correctAnswer}" is not a valid number` });
                    return;
                }
                correctAnswerText = numVal.toString();
            } else {
                correctAnswerText = correctAnswer;
            }

            questions.push({
                id: tempId++ + Math.random(),
                type: normalizedType,
                text,
                options: normalizedType === 'true_false' ? ['True', 'False'] : (normalizedType === 'fill_blank' || normalizedType === 'numeric' ? [] : allOptions),
                correctAnswer: normalizedType === 'multiple_correct' ? '' : (normalizedType === 'single_correct' || normalizedType === 'true_false' ? (choices.find(c => c.isCorrect)?.text || '') : correctAnswerText),
                correctAnswers: normalizedType === 'multiple_correct' ? choices.filter(c => c.isCorrect).map(c => c.text) : [],
                marks: marks
            });
        });

        res.json({
            success: true,
            imported: questions.length,
            data: questions,
            errors
        });
    } catch (error) {
        console.error('Bulk parse questions error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Clone Exam ---
exports.cloneExam = async (req, res) => {
    try {
        const source = await Exam.findById(req.params.id);
        if (!source) return res.status(404).json({ success: false, error: 'Exam not found' });

        const cloned = await Exam.create({
            collegeId: source.collegeId,
            courseId: source.courseId,
            title: `${source.title} (Copy)`,
            department: source.department,
            description: source.description,
            duration: source.duration,
            totalMarks: source.totalMarks,
            passingPercentage: source.passingPercentage,
            instructions: source.instructions,
            settings: source.settings,
            scheduledDate: Date.now(),
            expiryDate: null,
            status: 'draft',
            createdBy: req.user._id
        });

        const sourceQuestions = await Question.find({ examId: source._id });
        if (sourceQuestions.length > 0) {
            const clonedQuestions = sourceQuestions.map(q => ({
                examId: cloned._id,
                type: q.type,
                text: q.text,
                points: q.points,
                metadata: q.metadata,
                order: q.order,
                correctAnswerText: q.correctAnswerText,
                options: q.options,
                imageUrl: q.imageUrl
            }));
            await Question.insertMany(clonedQuestions);
        }

        await logAudit(req, 'CLONE_EXAM', 'Exam', cloned._id, cloned.title, { sourceId: source._id });
        res.json({ success: true, message: 'Exam cloned successfully', data: cloned });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        let filter = {};
        let attemptFilter = {};
        let collegeExamIds = [];
        
        const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
        const collegesList = isRegionalRole ? [
            ...(req.user.collegeId ? [req.user.collegeId] : []),
            ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
        ].map(id => id.toString()) : [];

        let collegeId = req.query.collegeId;
        if (req.user.role === 'college_admin') {
            collegeId = req.user.collegeId;
        } else if (isRegionalRole && !collegeId) {
            if (collegesList.length === 1) {
                collegeId = collegesList[0];
            }
        }

        if (collegeId && isRegionalRole && !collegesList.includes(collegeId.toString())) {
            return res.status(403).json({ success: false, error: 'Unauthorized to view this college context' });
        }

        let collegeTrainerIds = [];
        if (collegeId) {
            filter.collegeId = collegeId;
            const collegeExams = await Exam.find({ collegeId }).select('_id');
            collegeExamIds = collegeExams.map(e => e._id);
            attemptFilter.examId = { $in: collegeExamIds };

            const [mappings, collegeBatches] = await Promise.all([
                TrainerCourseMap.find({ collegeId, status: 'active' }).select('trainerId'),
                Batch.find({ collegeId }).select('trainerId')
            ]);
            const idsFromMappings = mappings.map(m => m.trainerId?.toString()).filter(Boolean);
            const idsFromBatches = collegeBatches.map(b => b.trainerId?.toString()).filter(Boolean);
            collegeTrainerIds = [...new Set([...idsFromMappings, ...idsFromBatches])];
        } else if (isRegionalRole) {
            filter.collegeId = { $in: collegesList };
            const collegeExams = await Exam.find({ collegeId: { $in: collegesList } }).select('_id');
            collegeExamIds = collegeExams.map(e => e._id);
            attemptFilter.examId = { $in: collegeExamIds };

            const [mappings, collegeBatches] = await Promise.all([
                TrainerCourseMap.find({ collegeId: { $in: collegesList }, status: 'active' }).select('trainerId'),
                Batch.find({ collegeId: { $in: collegesList } }).select('trainerId')
            ]);
            const idsFromMappings = mappings.map(m => m.trainerId?.toString()).filter(Boolean);
            const idsFromBatches = collegeBatches.map(b => b.trainerId?.toString()).filter(Boolean);
            collegeTrainerIds = [...new Set([...idsFromMappings, ...idsFromBatches])];
        }

        const [colleges, courses, trainers, exams, attempts, totalQuestions, batches, students] = await Promise.all([
            collegeId 
                ? College.countDocuments({ _id: collegeId })
                : (isRegionalRole ? College.countDocuments({ _id: { $in: collegesList } }) : College.countDocuments({})),
            (async () => {
                if (collegeId) {
                    const createdCount = await Course.countDocuments({ collegeId });
                    const mappedCount = await CollegeCourseMap.countDocuments({ collegeId });
                    return createdCount + mappedCount;
                } else if (isRegionalRole) {
                    const createdCount = await Course.countDocuments({ collegeId: { $in: collegesList } });
                    const mappedCount = await CollegeCourseMap.countDocuments({ collegeId: { $in: collegesList } });
                    return createdCount + mappedCount;
                } else {
                    return await Course.countDocuments({});
                }
            })(),
            User.countDocuments({ 
                role: 'trainer',
                ...(collegeId ? {
                    $or: [
                        { collegeId: collegeId },
                        { assignedColleges: collegeId },
                        { _id: { $in: collegeTrainerIds } }
                    ]
                } : (isRegionalRole ? {
                    $or: [
                        { collegeId: { $in: collegesList } },
                        { assignedColleges: { $in: collegesList } },
                        { _id: { $in: collegeTrainerIds } }
                    ]
                } : {}))
            }),
            Exam.countDocuments(filter),
            StudentAttempt.countDocuments(attemptFilter),
            Question.countDocuments(attemptFilter.examId ? { examId: attemptFilter.examId } : {}),
            Batch.countDocuments(collegeId ? { collegeId } : (isRegionalRole ? { collegeId: { $in: collegesList } } : {})),
            Student.countDocuments(collegeId ? { collegeId } : (isRegionalRole ? { collegeId: { $in: collegesList } } : {}))
        ]);

        let trainerFilter = { role: 'trainer' };
        if (collegeId) {
            trainerFilter.$or = [
                { collegeId: collegeId },
                { assignedColleges: collegeId },
                { _id: { $in: collegeTrainerIds } }
            ];
        } else if (isRegionalRole) {
            trainerFilter.$or = [
                { collegeId: { $in: collegesList } },
                { assignedColleges: { $in: collegesList } },
                { _id: { $in: collegeTrainerIds } }
            ];
        }

        const trainerList = await User.find(trainerFilter).populate('collegeId', 'name').select('firstName lastName username collegeId').lean();
        
        const activeTrainers = await Promise.all(trainerList.map(async (t) => {
            const count = await StudentAttempt.countDocuments({ 
                trainerId: t._id,
                ...(collegeId || isRegionalRole ? { examId: { $in: collegeExamIds } } : {})
            });
            return {
                id: t._id,
                name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.username,
                collegeName: t.collegeId ? t.collegeId.name : 'Independent',
                testsDone: count || 0,
                initials: (t.firstName?.[0] || t.username?.[0] || 'T').toUpperCase()
            };
        }));

        res.json({
            success: true,
            data: { 
                colleges, 
                courses, 
                trainers, 
                exams,
                attempts,
                totalQuestions,
                activeTrainers,
                batches,
                students
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// --- Exam Publishing & Key Generation ---
exports.publishExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
        
        exam.status = 'published';
        await exam.save();

        // Find all trainers assigned to this college (Primary or Additional)
        const trainers = await User.find({ 
            role: 'trainer', 
            $or: [
                { assignedCourses: exam.courseId },
                { collegeId: exam.collegeId },
                { assignedColleges: exam.collegeId }
            ]
        });
        const course = await Course.findById(exam.courseId);

        const targetBatches = exam.batches && exam.batches.length > 0 ? exam.batches : [null];
        const batchesDetails = await Batch.find({ _id: { $in: exam.batches || [] } });
        const batchMap = new Map(batchesDetails.map(b => [b._id.toString(), b]));

        const keys = [];
        for (const batchId of targetBatches) {
            const batch = batchId ? batchMap.get(batchId.toString()) : null;
            // Clean slug: uppercase, alphanumeric, max 4 chars
            const batchCode = batch 
                ? batch.batchName.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase() 
                : null;

            for (const trainer of trainers) {
                const randomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
                const examShort = exam.title.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase() || 'EX';
                
                const uniqueKey = batchCode 
                    ? `${course?.code || 'CRS'}-${examShort}-${batchCode}-${randomCode}`
                    : `${course?.code || 'CRS'}-${examShort}-${randomCode}`;
                
                await TrainerExamKey.create({
                    examId: exam._id,
                    trainerId: trainer._id,
                    batchId: batch ? batch._id : null,
                    uniqueKey
                });
                keys.push({ 
                    trainer: `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() || trainer.username, 
                    key: uniqueKey,
                    batchName: batch ? batch.batchName : 'General'
                });
            }
        }

        const Notification = require('../models/Notification');
        const notif = await Notification.create({
            title: 'Assessment Published',
            message: `"${exam.title}" is now published. ${keys.length} access key${keys.length === 1 ? '' : 's'} generated for assigned trainers.`,
            type: 'exam_published',
            collegeId: exam.collegeId,
            targetRoles: ['trainer', 'super_admin', 'college_admin'],
            targetUsers: trainers.map(t => t._id)
        });

        const io = req.app.get('socketio');
        if (io) {
            io.emit('new_notification', { ...notif.toObject(), isRead: false });
            io.emit('data_updated', {
                resource: 'exams',
                action: 'publish',
                data: { id: exam._id, title: exam.title, status: exam.status },
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Exam published and keys generated', keys });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.unpublishExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
        
        exam.status = 'draft';
        await exam.save();

        // Delete existing keys so they don't leak
        await TrainerExamKey.deleteMany({ examId: exam._id });

        res.json({ success: true, message: 'Exam unpublished, existing access keys revoked.' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.getAllotments = async (req, res) => {
    try {
        let collegeId = req.query.collegeId || (req.user.role === 'college_admin' ? req.user.collegeId : null);
        let filter = {};

        if (req.user.role === 'trainer') {
            filter.trainerId = req.user._id;
            if (collegeId) {
                const exams = await Exam.find({ collegeId }).select('_id');
                const examIds = exams.map(e => e._id);
                filter.examId = { $in: examIds };
            }
        } else if (collegeId) {
            // Find all exams for this college
            const exams = await Exam.find({ collegeId }).select('_id');
            const examIds = exams.map(e => e._id);
            filter.examId = { $in: examIds };
        }

        const allotments = await TrainerExamKey.find(filter)
            .populate({
                path: 'examId',
                select: 'title courseId status',
                populate: { path: 'courseId', select: 'name code' }
            })
            .populate('trainerId', 'firstName lastName email phone')
            .populate('batchId', 'batchName department')
            .sort('-createdAt');

        res.json({ success: true, count: allotments.length, data: allotments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// --- AI OCR Document Parsing ---
exports.parseDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No document uploaded' });

        let textData = '';
        const fileExt = req.file.originalname.split('.').pop().toLowerCase();

        if (fileExt === 'pdf') {
            const data = await pdfParse(req.file.buffer);
            textData = data.text;
        } else if (fileExt === 'docx') {
            const data = await mammoth.extractRawText({ buffer: req.file.buffer });
            textData = data.value;
        } else {
            return res.status(400).json({ success: false, error: 'Unsupported file format. Use PDF or DOCX.' });
        }

        if (!textData || textData.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'The uploaded document appears to be empty or consists only of scanned images. Please upload a PDF or DOCX file with selectable text.' });
        }

        // --- Advanced Global Parsing Logic ---
        // Pre-process: Clean up common OCR artifacts
        let cleanText = textData
            .replace(/-- \d+ of \d+ -- Paper \d+\s+WEEK \d+/g, '') // Remove page footers
            .replace(/[ƟŌƠơ]/g, 't') // Fix "t" ligatures in OCR
            .replace(/AŌer/g, 'After')
            .replace(/acƟvity/g, 'activity')
            .replace(/anƟvirus/g, 'antivirus');

        // Split text by question numbers: "1. ", "31. " (must be at start or preceded by space/newline)
        const questionBoundaries = cleanText.split(/[\r\n\s]+(\d+)[\.\)]\s+/);
        
        const extractedQuestions = [];
        // First part is usually some header text, ignore it
        for (let i = 1; i < questionBoundaries.length; i += 2) {
            const rawIndex = questionBoundaries[i];
            const content = questionBoundaries[i+1];
            if (!content) continue;

            // Within content, attempt to find question text and options
            // Usually, question text ends with "?" or is the first few lines
            const questionTextEndIndex = content.indexOf('?');
            let questionText = '';
            let remainingText = '';

            if (questionTextEndIndex !== -1) {
                questionText = content.substring(0, questionTextEndIndex + 1).trim();
                remainingText = content.substring(questionTextEndIndex + 1).trim();
            } else {
                // If no question mark, check for "Options" header
                const optionsHeaderIndex = content.search(/Options\s*[:\.\-(\[]/i);
                if (optionsHeaderIndex !== -1) {
                    questionText = content.substring(0, optionsHeaderIndex).trim();
                    remainingText = content.substring(optionsHeaderIndex).trim();
                } else {
                    // Fallback to first few lines or char limit
                    const lines = content.split('\n');
                    if (lines.length > 1 && lines[0].length < 200) {
                        questionText = lines[0].trim();
                        remainingText = lines.slice(1).join('\n').trim();
                    } else {
                        questionText = content.substring(0, 150).trim() + '...';
                        remainingText = content.substring(150).trim();
                    }
                }
            }

            // Extract Options
            let options = [];
            let correctAnswers = [];
            let type = 'single_correct';

            // Check if there are labeled options A. B. C. D.
            const optionRegex = /\b([A-F])[\.\)\-]\s+([^\s].+?)(?=\s+[A-F][\.\)\-]\s+|$)/gi;
            let optMatches = [...remainingText.matchAll(optionRegex)];

            if (optMatches.length > 0) {
                for (const match of optMatches) {
                    let optText = match[2].trim();
                    const isCorrect = optText.endsWith('*');
                    if (isCorrect) optText = optText.replace(/\*+$/, '').trim();
                    options.push(optText);
                    if (isCorrect) correctAnswers.push(optText);
                }
            } else {
                // FALLBACK: If no A. B. labels, attempt smart splitting
                // Check if it's "Options: Word Word Word Word" or just "Word Word Word Word"
                let cleanRemaining = remainingText.replace(/^Options(\s*\(.*?\))?\s*[:\.\-]?\s*/i, '').trim();
                
                // If the text has 4-6 capitalized words/phrases, split by them
                // This is a heuristic for when OCR misses letters
                const words = cleanRemaining.split(/\s+/);
                if (words.length >= 4 && words.length <= 12) {
                    // Group words into capitalized phrases (e.g. "Fileless malware")
                    let currentOpt = "";
                    for (const word of words) {
                        if (/^[A-Z]/.test(word) && currentOpt !== "") {
                            options.push(currentOpt.trim());
                            currentOpt = word;
                        } else {
                            currentOpt += " " + word;
                        }
                    }
                    if (currentOpt) options.push(currentOpt.trim());
                }

                if (options.length < 2) {
                    // Last resort: split by newlines
                    options = cleanRemaining.split('\n')
                        .map(o => o.trim())
                        .filter(o => o.length > 0 && o.length < 200);
                }
                
                // Limit options
                if (options.length > 6) options = options.slice(0, 4);
            }

            // Detect if question contains an answer like "Answer: True" or "Answer: A"
            const answerMatch = content.match(/Answer\s*[:\.\-]?\s*(True|False|([A-F]+))/i);
            if (answerMatch) {
                const ansStr = answerMatch[1].trim();
                if (ansStr.toLowerCase() === 'true' || ansStr.toLowerCase() === 'false') {
                    type = 'true_false';
                    if (options.length === 0) options = ['True', 'False'];
                    correctAnswers = [ansStr.charAt(0).toUpperCase() + ansStr.slice(1).toLowerCase()];
                } else {
                    // It's a letter
                    const letters = ansStr.toUpperCase().split('');
                    for (const char of letters) {
                        const idx = char.charCodeAt(0) - 65;
                        if (options[idx]) correctAnswers.push(options[idx]);
                    }
                }
            }

            // Post-process type
            if (correctAnswers.length > 1) {
                type = 'multiple_correct';
            } else if (type !== 'true_false' && options.length > 0) {
                type = 'single_correct';
            }

            if (options.length === 0) {
                // Check if it's a True/False question based on context
                if (questionText.toLowerCase().includes('answer: true') || questionText.toLowerCase().includes('answer: false')) {
                    type = 'true_false';
                    options = ['True', 'False'];
                    const isTrue = questionText.toLowerCase().includes('true');
                    correctAnswers = [isTrue ? 'True' : 'False'];
                    questionText = questionText.replace(/Answer\s*[:\.\-]\s*(True|False)/i, '').trim();
                } else {
                    type = 'fill_blank';
                }
            }

            extractedQuestions.push({
                text: questionText,
                options: options.slice(0, 6), // Max 6 options
                type,
                correctAnswer: correctAnswers.length === 1 ? correctAnswers[0] : '',
                correctAnswers: correctAnswers,
                marks: 5
            });
        }

        const formatted = extractedQuestions;
        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (error) {
        console.error('OCR REASON:', error);
        res.status(500).json({ 
            success: false, 
            error: `OCR Error: ${error.message || 'Unknown processing error'}`
        });
    }
};

// ========== Admin Training Logs ==========
exports.getAdminTrainingLogs = async (req, res) => {
    try {
        const AttendanceSession = require('../models/AttendanceSession');
        let filter = {};
        if (req.user.role === 'college_admin') {
            filter.collegeId = req.user.collegeId;
        } else if (req.user.role === 'super_admin') {
            const targetCollegeId = req.query.collegeId;
            if (targetCollegeId && targetCollegeId !== 'all') {
                filter.collegeId = targetCollegeId;
            }
        }

        const { trainerId, courseId } = req.query;
        if (trainerId && trainerId !== 'all') {
            filter.trainerId = trainerId;
        }
        if (courseId && courseId !== 'all') {
            filter.courseId = courseId;
        }

        const sessions = await AttendanceSession.find(filter)
            .populate('trainerId', 'username firstName lastName phone')
            .populate('collegeId', 'name')
            .populate('courseId', 'name code')
            .populate('batchId', 'batchName department startDate')
            .sort({ date: -1, createdAt: -1 });

        // Map sessions directly to flat, detailed log rows
        const data = sessions.map(sess => {
            const trainerName = sess.trainerId
                ? `${sess.trainerId.firstName || ''} ${sess.trainerId.lastName || ''}`.trim() || sess.trainerId.username
                : 'System';
            
            const presentCount = sess.records?.filter(r => r.status === 'present' || r.status === 'late').length || 0;
            const actualCount = sess.records?.length || 0;
            const attRate = actualCount > 0 ? ((presentCount / actualCount) * 100).toFixed(1) : '0.0';

            return {
                _id: sess._id,
                logDate: sess.createdAt,
                sessionDate: sess.date,
                trainerName,
                trainerPhone: sess.trainerId?.phone || '—',
                collegeId: sess.collegeId?._id || sess.collegeId,
                collegeName: sess.collegeId?.name || '—',
                courseId: sess.courseId?._id || sess.courseId,
                courseName: sess.courseId?.name || '—',
                courseCode: sess.courseId?.code || '—',
                batchId: sess.batchId?._id || sess.batchId,
                batchName: sess.batchId?.batchName || '—',
                department: sess.batchId?.department || '—',
                timeSlot: sess.period || 'Hour 1',
                moduleTaught: sess.module || '—',
                presentCount,
                actualCount,
                avgAttendance: attRate,
                topicsCovered: sess.topic,
                duration: sess.duration || 60
            };
        });

        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Admin User Accounts Controller ---
exports.getAdminUsers = async (req, res) => {
    try {
        const roles = ['ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin'];
        const users = await User.find({ role: { $in: roles } })
            .select('-password')
            .populate('collegeId', 'name')
            .populate('assignedColleges', 'name')
            .lean();
        res.json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createAdminUser = async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, phone, role, collegeId, assignedColleges } = req.body;
        
        if (!password) {
            return res.status(400).json({ success: false, error: 'Password is required' });
        }
        
        if (username) {
            const existingUser = await User.findOne({ username });
            if (existingUser) return res.status(400).json({ success: false, error: 'Username already exists' });
        }
        if (email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        if (phone) {
            const existingPhone = await User.findOne({ phone, role });
            if (existingPhone) return res.status(400).json({ success: false, error: `A user with role ${role} and this phone number already exists` });
        }

        const newUser = await User.create({
            username,
            email: email || undefined,
            password,
            firstName,
            lastName,
            phone,
            role,
            collegeId: collegeId || null,
            assignedColleges: assignedColleges || []
        });

        await logAudit(req, 'CREATE_ADMIN_USER', 'User', newUser._id, `${newUser.firstName} ${newUser.lastName}`.trim() || newUser.username || newUser.email);
        
        const userResponse = newUser.toObject();
        delete userResponse.password;

        res.status(201).json({ success: true, data: userResponse });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.updateAdminUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userToUpdate = await User.findById(id);
        if (!userToUpdate) return res.status(404).json({ success: false, error: 'User not found' });

        const updateData = { ...req.body };
        
        if (updateData.role && !['ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin'].includes(updateData.role)) {
            delete updateData.role;
        }

        if (updateData.username) {
            const existingUser = await User.findOne({ username: updateData.username, _id: { $ne: id } });
            if (existingUser) return res.status(400).json({ success: false, error: 'Username already exists' });
        }
        if (updateData.email) {
            const existingEmail = await User.findOne({ email: updateData.email, _id: { $ne: id } });
            if (existingEmail) return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        } else {
            delete updateData.password;
        }

        if (updateData.collegeId === "" || updateData.collegeId === null) {
            updateData.collegeId = null;
        }

        const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
            .select('-password')
            .populate('collegeId', 'name')
            .populate('assignedColleges', 'name');

        await logAudit(req, 'UPDATE_ADMIN_USER', 'User', updatedUser._id, `${updatedUser.firstName} ${updatedUser.lastName}`.trim() || updatedUser.username || updatedUser.email);
        res.json({ success: true, data: updatedUser });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.deleteAdminUser = async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ success: false, error: 'User not found' });
        
        if (userToDelete.role === 'super_admin') {
            return res.status(400).json({ success: false, error: 'Cannot delete super_admin account' });
        }

        await logAudit(req, 'DELETE_ADMIN_USER', 'User', userToDelete._id, `${userToDelete.firstName} ${userToDelete.lastName}`.trim() || userToDelete.username || userToDelete.email);
        await userToDelete.deleteOne();
        res.json({ success: true, message: 'User account deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
