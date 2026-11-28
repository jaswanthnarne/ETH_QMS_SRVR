const Student = require('../models/Student');
const StudentAttempt = require('../models/StudentAttempt');
const TrainerExamKey = require('../models/TrainerExamKey');
const Exam = require('../models/Exam');
const College = require('../models/College');
const Batch = require('../models/Batch');
const AttendanceSession = require('../models/AttendanceSession');
const Todo = require('../models/Todo');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using existing environment keys
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const generateToken = (id, sessionId) => {
    return jwt.sign({ id, sessionId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d'
    });
};

// @desc    Get active partner colleges for public landing marquee
// @route   GET /api/student/colleges
// @access  Public
exports.getPublicColleges = async (req, res) => {
    try {
        const colleges = await College.find({ status: 'active' })
            .select('name code logoUrl address')
            .lean();
        res.json({ success: true, data: colleges });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch colleges' });
    }
};

// @desc    Authenticate Student & get token
// @route   POST /api/student/login
// @access  Public
exports.loginStudent = async (req, res) => {
    try {
        const { usernameOrMobile, password } = req.body;

        if (!usernameOrMobile || !password) {
            return res.status(400).json({ success: false, error: 'Username/Mobile number and password are required' });
        }

        const queryValue = usernameOrMobile.trim();
        const escapedQuery = queryValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Find by mobile number or USN
        let student = await Student.findOne({
            $or: [
                { mobile: queryValue },
                { usn: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } }
            ]
        })
            .select('+password')
            .populate('collegeId')
            .populate('batchId');

        if (!student) {
            return res.status(401).json({ success: false, error: 'Invalid credentials. User not found.' });
        }

        const collegeCode = (student.collegeId?.code || '').trim();
        const defaultPassword = `${collegeCode}@3!`.toLowerCase();
        const enteredPasswordLower = password.trim().toLowerCase();

        let isMatch = false;
        if (student.password) {
            isMatch = await student.matchPassword(password);
        } else {
            // First time login logic: match default password
            isMatch = (enteredPasswordLower === defaultPassword);
            if (isMatch) {
                // Auto-save the password to the DB (it will trigger the pre-save bcrypt hash)
                student.password = password;
                await student.save();
            }
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials. Incorrect password.' });
        }

        // Enforce Max 1 Active Login Per Student: generate new sessionId & evict any previous session
        const newSessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        const hadExistingSession = Boolean(student.activeSessionId);
        await Student.findByIdAndUpdate(student._id, { activeSessionId: newSessionId });

        const io = req.app.get('socketio');
        if (io && hadExistingSession) {
            io.to(`auth_session_${student._id.toString()}`).emit('session_replaced', {
                userId: student._id.toString(),
                newSessionId,
                role: 'student',
                code: 'SESSION_REPLACED',
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            _id: student._id,
            name: student.name,
            usn: student.usn,
            mobile: student.mobile,
            email: student.email,
            semester: student.semester,
            department: student.department,
            division: student.division,
            collegeName: student.collegeId?.name || '',
            collegeCode: collegeCode,
            batchName: student.batchId?.batchName || '',
            skills: student.skills || [],
            capabilities: student.capabilities || '',
            jobPreferences: student.jobPreferences || {},
            resumeUrl: student.resumeUrl || '',
            cgpa: student.cgpa || 0,
            backlogs: student.backlogs || 0,
            sessionId: newSessionId,
            token: generateToken(student._id, newSessionId)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    First time password setup / reset password
// @route   POST /api/student/setup-password
// @access  Public
exports.setupStudentPassword = async (req, res) => {
    try {
        const { usn, identifier, newPassword } = req.body;

        if (!usn || !identifier || !newPassword) {
            return res.status(400).json({ success: false, error: 'USN, registered email/mobile, and new password are required' });
        }

        // Search strictly by combination of USN and registered mobile/email to handle USN duplication across colleges
        const student = await Student.findOne({
            usn: usn.trim().toUpperCase(),
            $or: [
                { mobile: identifier.trim() },
                { email: identifier.trim().toLowerCase() }
            ]
        });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student record not found or registered email/mobile does not match.' });
        }

        // Update password (triggers hashing in schema pre-save hook)
        student.password = newPassword;
        await student.save();

        res.json({ success: true, message: 'Password set up successfully. You can now log in.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Change Student Password
// @route   PUT /api/student/change-password
// @access  Private (Student)
exports.changeStudentPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current password and new password are required' });
        }

        const student = await Student.findById(req.student._id).select('+password').populate('collegeId');
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const collegeCode = (student.collegeId?.code || '').trim();
        const defaultPassword = `${collegeCode}@3!`.toLowerCase();
        let isMatch = false;

        if (student.password) {
            isMatch = await student.matchPassword(currentPassword);
        } else {
            isMatch = (currentPassword.toLowerCase() === defaultPassword);
        }

        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Incorrect current password' });
        }

        student.password = newPassword;
        await student.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update Student Career Profile
// @route   PUT /api/student/profile
// @access  Private (Student)
exports.updateStudentProfile = async (req, res) => {
    try {
        const { skills, capabilities, jobPreferences, name, email, mobile, cgpa, backlogs } = req.body;
        const student = await Student.findById(req.student._id);

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        if (name !== undefined) student.name = name;
        if (email !== undefined) student.email = email;
        if (mobile !== undefined) student.mobile = mobile;
        if (skills !== undefined) student.skills = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim()).filter(Boolean);
        if (capabilities !== undefined) student.capabilities = capabilities;
        if (jobPreferences !== undefined) student.jobPreferences = jobPreferences;
        if (cgpa !== undefined) student.cgpa = parseFloat(cgpa || 0);
        if (backlogs !== undefined) student.backlogs = parseInt(backlogs || 0);

        await student.save();

        res.json({
            success: true,
            message: 'Profile details updated successfully',
            data: {
                name: student.name,
                email: student.email,
                mobile: student.mobile,
                skills: student.skills,
                capabilities: student.capabilities,
                jobPreferences: student.jobPreferences,
                cgpa: student.cgpa,
                backlogs: student.backlogs
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Upload Student Resume PDF
// @route   POST /api/student/resume
// @access  Private (Student)
exports.uploadStudentResume = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload a PDF file' });
        }

        const student = await Student.findById(req.student._id);
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const ext = path.extname(req.file.originalname || '') || '.pdf';
        const baseName = path.basename(req.file.originalname || 'resume', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = `${Date.now()}_${baseName}${ext}`;
        fs.writeFileSync(path.join(uploadDir, safeName), req.file.buffer);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host') || `127.0.0.1:${process.env.PORT || 5500}`;
        student.resumeUrl = `${protocol}://${host}/uploads/resumes/${safeName}`;
        await student.save();

        res.json({
            success: true,
            resumeUrl: student.resumeUrl,
            message: 'Resume PDF uploaded successfully'
        });
    } catch (error) {
        console.error('Student resume upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getStudentMe = async (req, res) => {
    try {
        const student = await Student.findById(req.student._id)
            .populate('collegeId', 'name code address logoUrl')
            .populate({
                path: 'batchId',
                select: 'batchName department program startDate endDate status studentCount trainerId courseId materials createdAt',
                populate: [
                    { path: 'trainerId', select: 'firstName lastName phone email' },
                    { path: 'courseId', select: 'name code description duration modulesCount program status syllabusUrl materials' }
                ]
            });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student profile not found' });
        }

        const batchStrength = student.batchId?._id
            ? await Student.countDocuments({ batchId: student.batchId._id })
            : 0;

        // Calculate attendance dynamically
        let attendanceSummary = {
            totalSessions: 0,
            attended: 0,
            percentage: 0
        };

        if (student.batchId?._id) {
            const sessions = await AttendanceSession.find({ batchId: student.batchId._id })
                .populate('trainerId', 'firstName lastName')
                .sort({ date: -1 });
            const total = sessions.length;
            let attended = 0;
            const history = [];

            sessions.forEach(sess => {
                const record = sess.records.find(r => r.studentId.toString() === student._id.toString());
                const status = record ? record.status : 'absent';
                if (status === 'present' || status === 'late') {
                    attended++;
                }
                history.push({
                    _id: sess._id,
                    date: sess.date,
                    topic: sess.topic,
                    duration: sess.duration,
                    period: sess.period,
                    module: sess.module || 'Module 1',
                    trainerName: sess.trainerId ? `${sess.trainerId.firstName} ${sess.trainerId.lastName}` : 'N/A',
                    status: status,
                    remarks: record ? record.remarks : ''
                });
            });

            attendanceSummary = {
                totalSessions: total,
                attended: attended,
                percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
                history: history
            };
        }

        const studentObj = student.toObject();
        studentObj.collegeName = student.collegeId?.name || studentObj.collegeName || '';
        studentObj.collegeCode = student.collegeId?.code || studentObj.collegeCode || '';
        studentObj.batchName = student.batchId?.batchName || studentObj.batchName || '';
        studentObj.courseName = student.batchId?.courseId?.name || '';
        studentObj.courseCode = student.batchId?.courseId?.code || '';
        studentObj.trainerName = student.batchId?.trainerId
            ? `${student.batchId.trainerId.firstName || ''} ${student.batchId.trainerId.lastName || ''}`.trim()
            : '';
        studentObj.batchStrength = batchStrength || student.batchId?.studentCount || 0;

        res.json({ 
            success: true, 
            data: studentObj,
            attendance: attendanceSummary
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Attempts History for Student
// @route   GET /api/student/attempts
// @access  Private (Student)
exports.getStudentAttempts = async (req, res) => {
    try {
        const student = req.student;

        // Fetch actual student attempts
        const attempts = await StudentAttempt.find({ 'studentDetails.rollNumber': student.usn })
            .populate({
                path: 'examId',
                select: 'title totalMarks passingPercentage courseId settings',
                populate: { path: 'courseId', select: 'name' }
            })
            .sort({ createdAt: -1 });

        // Fetch targeted exams for student's batch or all-batches
        const targetedKeys = await TrainerExamKey.find({
            $or: [
                { batchId: student.batchId },
                { batchId: null }
            ]
        }).populate({
            path: 'examId',
            select: 'title totalMarks passingPercentage courseId settings',
            populate: { path: 'courseId', select: 'name' }
        });

        // Merge actual attempts and targeted keys
        const attemptedExamIds = new Set(
            attempts.map(a => a.examId?._id?.toString()).filter(Boolean)
        );

        const merged = attempts.map(attempt => {
            // Convert to a plain object to append virtual fields
            const attemptObj = attempt.toObject();
            attemptObj.isMock = false;
            return attemptObj;
        });

        for (const key of targetedKeys) {
            if (!key.examId) continue;
            const examIdStr = key.examId._id.toString();

            if (!attemptedExamIds.has(examIdStr)) {
                merged.push({
                    _id: `target-${key._id}`,
                    examId: key.examId,
                    sessionId: key.uniqueKey,
                    totalScore: 0,
                    percentage: 0,
                    status: 'not_attempted',
                    result: 'pending',
                    isMock: true,
                    isActive: key.isActive,
                    isStarted: key.isStarted,
                    isPaused: key.isPaused,
                    createdAt: key.createdAt || new Date()
                });
            }
        }

        // Sort by createdAt descending
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, count: merged.length, data: merged });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Active assessments for Student's batch
// @route   GET /api/student/active-exams
// @access  Private (Student)
exports.getStudentActiveExams = async (req, res) => {
    try {
        const student = req.student;

        // Find active exam keys targeted at student's batch or all-batches
        const activeKeys = await TrainerExamKey.find({
            isActive: true,
            $or: [
                { batchId: student.batchId },
                { batchId: null }
            ]
        }).populate({
            path: 'examId',
            populate: { path: 'courseId', select: 'name' }
        });

        const filtered = [];
        for (const key of activeKeys) {
            const exam = key.examId;
            if (!exam || exam.status !== 'published') continue;

            // Check targeted batches
            const hasTargetedBatches = exam.batches && exam.batches.length > 0;
            const isTargeted = !hasTargetedBatches ||
                               exam.batches.some(b => b.toString() === student.batchId.toString()) ||
                               (key.batchId && key.batchId.toString() === student.batchId.toString());

            if (!isTargeted) continue;

            // Check schedules
            const now = new Date();
            if (exam.scheduledDate && now < new Date(exam.scheduledDate)) continue;
            if (exam.expiryDate && now > new Date(exam.expiryDate)) continue;

            // Check if attempt is already completed
            const hasCompleted = await StudentAttempt.findOne({
                examId: exam._id,
                'studentDetails.rollNumber': student.usn,
                status: 'completed'
            });

            filtered.push({
                exam: {
                    _id: exam._id,
                    title: exam.title,
                    duration: exam.duration,
                    totalMarks: exam.totalMarks,
                    passingPercentage: exam.passingPercentage,
                    instructions: exam.instructions,
                    settings: exam.settings,
                    courseName: exam.courseId?.name || ''
                },
                sessionKey: key.uniqueKey,
                isStarted: key.isStarted,
                isPaused: key.isPaused,
                isCompleted: !!hasCompleted
            });
        }

        res.json({ success: true, count: filtered.length, data: filtered });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get all Todo tasks for the logged in student
// @route   GET /api/student/todos
// @access  Private (Student)
exports.getStudentTodos = async (req, res) => {
    try {
        const todos = await Todo.find({ studentId: req.student._id })
            .sort({ createdAt: -1 });
        res.json({ success: true, count: todos.length, data: todos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Create a new Todo task
// @route   POST /api/student/todos
// @access  Private (Student)
exports.createStudentTodo = async (req, res) => {
    try {
        const { title, description, dueDate, isStarred, isPriority } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, error: 'Task title is required' });
        }

        const todo = await Todo.create({
            studentId: req.student._id,
            title,
            description,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            isStarred: !!isStarred,
            isPriority: !!isPriority,
            status: 'pending'
        });

        res.status(201).json({ success: true, data: todo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update a Todo task details or status
// @route   PUT /api/student/todos/:id
// @access  Private (Student)
exports.updateStudentTodo = async (req, res) => {
    try {
        const { title, description, dueDate, isStarred, isPriority, status } = req.body;
        const todo = await Todo.findOne({ _id: req.params.id, studentId: req.student._id });

        if (!todo) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }

        if (title !== undefined) todo.title = title;
        if (description !== undefined) todo.description = description;
        if (dueDate !== undefined) todo.dueDate = dueDate ? new Date(dueDate) : undefined;
        if (isStarred !== undefined) todo.isStarred = !!isStarred;
        if (isPriority !== undefined) todo.isPriority = !!isPriority;
        
        if (status !== undefined) {
            todo.status = status;
            if (status === 'completed') {
                todo.completedAt = new Date();
            } else {
                todo.completedAt = undefined;
            }
        }

        await todo.save();
        res.json({ success: true, data: todo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Permanently delete a Todo task
// @route   DELETE /api/student/todos/:id
// @access  Private (Student)
exports.deleteStudentTodoPermanently = async (req, res) => {
    try {
        const todo = await Todo.findOneAndDelete({ _id: req.params.id, studentId: req.student._id });

        if (!todo) {
            return res.status(404).json({ success: false, error: 'Task not found or not authorized' });
        }

        res.json({ success: true, message: 'Task deleted permanently' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get study materials for student's mapped batch (Uploaded by Teacher) & mapped course (LMS)
// @route   GET /api/student/study-materials
// @access  Private (Student)
exports.getStudentStudyMaterials = async (req, res) => {
    try {
        // Auto-remove any legacy broken Cloudinary PDF entries from earlier test uploads
        await Batch.updateMany(
            { 'materials.fileUrl': { $regex: /res\.cloudinary\.com.*qms_study_materials/i } },
            { $pull: { materials: { fileUrl: { $regex: /res\.cloudinary\.com.*qms_study_materials/i } } } }
        );

        const student = await Student.findById(req.student._id)
            .populate({
                path: 'batchId',
                select: 'batchName department program status trainerId courseId materials',
                populate: [
                    { path: 'trainerId', select: 'firstName lastName email' },
                    { path: 'courseId', select: 'name code description duration modulesCount program status syllabusUrl materials' }
                ]
            });

        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const batch = student.batchId || null;
        const course = batch?.courseId || null;
        const trainer = batch?.trainerId || null;

        res.json({
            success: true,
            data: {
                batchName: batch?.batchName || '',
                trainerName: trainer ? `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() : '',
                course: course ? {
                    _id: course._id,
                    name: course.name,
                    code: course.code,
                    description: course.description,
                    duration: course.duration,
                    modulesCount: course.modulesCount,
                    program: course.program,
                    syllabusUrl: course.syllabusUrl || ''
                } : null,
                teacherMaterials: Array.isArray(batch?.materials)
                    ? [...batch.materials].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
                    : [],
                lmsMaterials: Array.isArray(course?.materials)
                    ? [...course.materials].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
                    : []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
