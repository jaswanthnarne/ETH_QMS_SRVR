const College = require('../models/College');
const Course = require('../models/Course');
const User = require('../models/User');
const Exam = require('../models/Exam');
const TrainerExamKey = require('../models/TrainerExamKey');
const Question = require('../models/Question');
const StudentAttempt = require('../models/StudentAttempt');
const TrainingLog = require('../models/TrainingLog');
const Batch = require('../models/Batch');

const crypto = require('crypto');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { logAudit } = require('../utils/auditHelper');

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
        }
        const colleges = await College.find(filter);
        res.json({ success: true, count: colleges.length, data: colleges });
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

// --- Course Controller ---
exports.getCourses = async (req, res) => {
    try {
        let collegeId = req.params.collegeId || req.query.collegeId;
        
        if (req.user.role === 'college_admin') {
            collegeId = req.user.collegeId;
        }

        let filter = {};
        if (collegeId) {
            filter.collegeId = collegeId;
        }

        const courses = await Course.find(filter)
            .populate('collegeId', 'name')
            .populate('createdBy', 'firstName lastName username role');
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

        if (!collegeId) {
            return res.status(400).json({ success: false, error: 'College ID is required' });
        }

        const course = await Course.create({ 
            ...req.body, 
            collegeId,
            createdBy: req.user._id 
        });
        
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

        // Also delete exams associated with this course
        await Exam.deleteMany({ courseId: req.params.id });
        await course.deleteOne();
        emitDataUpdated(req, 'courses', 'delete', { id: req.params.id });
        res.json({ success: true, message: 'Course and its exams deleted' });
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
                { assignedColleges: collegeId },
                { collegeId: null },
                { collegeId: { $exists: false } }
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

        const trainers = trainersList.map(t => ({
            ...t,
            testsCount: countMap[t._id.toString()] || 0
        }));
            
        res.json({ success: true, count: trainers.length, data: trainers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createTrainer = async (req, res) => {
    try {
        let { password, collegeId, assignedColleges, assignedCourses, firstName, lastName, phone, employeeId } = req.body;
        
        if (req.user.role === 'college_admin') {
            collegeId = req.user.collegeId;
        }

        if (!phone) return res.status(400).json({ success: false, error: 'Mobile number is required' });
        if (!password) return res.status(400).json({ success: false, error: 'Password is required' });

        const existing = await User.findOne({ phone, role: 'trainer' });
        if (existing) return res.status(400).json({ success: false, error: 'A trainer with this mobile number already exists' });

        if (employeeId) {
            const existingEmp = await User.findOne({ employeeId });
            if (existingEmp) return res.status(400).json({ success: false, error: 'A trainer with this Employee ID already exists' });
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
            username: employeeId || phone // Default to employeeId, fallback to phone
        });

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
        const updateData = { ...req.body };
        delete updateData.role; // Never change role here
        if (updateData.collegeId === "" || updateData.collegeId === null) {
            updateData.collegeId = null;
        } else if (!updateData.collegeId) {
            delete updateData.collegeId;
        }

        // If phone changed, update username fallback
        if (updateData.phone && !updateData.employeeId) updateData.username = updateData.phone;
        
        if (updateData.employeeId) {
            const existingEmp = await User.findOne({ employeeId: updateData.employeeId, _id: { $ne: id } });
            if (existingEmp) return res.status(400).json({ success: false, error: 'A trainer with this Employee ID already exists' });
            updateData.username = updateData.employeeId;
        }

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        } else {
            delete updateData.password;
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
        await trainer.deleteOne();
        emitDataUpdated(req, 'trainers', 'delete', { id: trainer._id });
        res.json({ success: true, message: 'Trainer access revoked' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- Exam Controller ---
exports.createExam = async (req, res) => {
    try {
        const { 
            collegeId, courseId, title, department, description, duration, 
            totalMarks, passingMarks, instructions, settings, questions, batches
        } = req.body;

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

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];

        const questions = [];
        const errors = [];
        let rowIndex = 0;

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header
            rowIndex++;
            const text = row.getCell(1).value?.toString()?.trim();
            const type = row.getCell(2).value?.toString()?.trim()?.toLowerCase() || 'single_correct';
            const optA = row.getCell(3).value?.toString()?.trim();
            const optB = row.getCell(4).value?.toString()?.trim();
            const optC = row.getCell(5).value?.toString()?.trim();
            const optD = row.getCell(6).value?.toString()?.trim();
            const correctAnswer = row.getCell(7).value?.toString()?.trim();
            const marks = parseFloat(row.getCell(8).value) || 1;
            const difficulty = row.getCell(9).value?.toString()?.trim()?.toLowerCase() || 'medium';

            if (!text) { errors.push({ row: rowNumber, error: 'Question text is required' }); return; }
            if (!correctAnswer) { errors.push({ row: rowNumber, error: 'Correct answer is required' }); return; }

            const allOptions = [optA, optB, optC, optD].filter(Boolean);

            let choices = [];
            let correctAnswerText = null;
            const normalizedType = ['single_correct','mcq'].includes(type) ? 'single_correct'
                : ['multiple_correct','multiple'].includes(type) ? 'multiple_correct'
                : ['true_false'].includes(type) ? 'true_false'
                : ['fill_blank','fill_blanks'].includes(type) ? 'fill_blank'
                : ['numeric'].includes(type) ? 'numeric'
                : 'single_correct';

            if (normalizedType === 'single_correct' || normalizedType === 'true_false') {
                const opts = normalizedType === 'true_false' ? ['True', 'False'] : allOptions;
                choices = opts.map((opt, i) => ({ id: `opt_${i}`, text: opt, isCorrect: opt.toLowerCase() === correctAnswer.toLowerCase() }));
            } else if (normalizedType === 'multiple_correct') {
                const correctArr = correctAnswer.split(',').map(s => s.trim().toLowerCase());
                choices = allOptions.map((opt, i) => ({ id: `opt_${i}`, text: opt, isCorrect: correctArr.includes(opt.toLowerCase()) }));
            } else {
                correctAnswerText = correctAnswer;
            }

            questions.push({
                examId,
                type: normalizedType,
                text,
                points: marks,
                difficulty: ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium',
                order: rowIndex,
                correctAnswerText,
                options: { choices }
            });
        });

        if (questions.length > 0) {
            await Question.insertMany(questions);
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
                difficulty: q.difficulty,
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
        
        const collegeId = req.query.collegeId || (req.user.role === 'college_admin' ? req.user.collegeId : null);

        if (collegeId) {
            filter.collegeId = collegeId;
            const collegeExams = await Exam.find({ collegeId }).select('_id');
            attemptFilter.examId = { $in: collegeExams.map(e => e._id) };
        }

        const [colleges, courses, trainers, exams, attempts, totalQuestions] = await Promise.all([
            College.countDocuments(req.user.role === 'super_admin' ? {} : { _id: req.user.collegeId }),
            Course.countDocuments(filter),
            User.countDocuments({ 
                role: 'trainer',
                ...(req.user.role === 'college_admin' ? {
                    $or: [
                        { collegeId: req.user.collegeId },
                        { assignedColleges: req.user.collegeId }
                    ]
                } : {})
            }),
            Exam.countDocuments(filter),
            StudentAttempt.countDocuments(attemptFilter),
            Question.countDocuments(attemptFilter.examId ? { examId: attemptFilter.examId } : {})
        ]);

        let trainerFilter = { role: 'trainer' };
        if (req.user.role === 'college_admin') {
            trainerFilter.$or = [
                { collegeId: req.user.collegeId },
                { assignedColleges: req.user.collegeId }
            ];
        } else if (collegeId) {
            trainerFilter.$or = [
                { collegeId: collegeId },
                { assignedColleges: collegeId }
            ];
        }

        const trainerList = await User.find(trainerFilter).populate('collegeId', 'name').select('firstName lastName username collegeId lean');
        
        const activeTrainers = await Promise.all(trainerList.map(async (t) => {
            const count = await StudentAttempt.countDocuments({ trainerId: t._id });
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
                activeTrainers
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
                    ? `${course.code}-${examShort}-${batchCode}-${randomCode}`
                    : `${course.code}-${examShort}-${randomCode}`;
                
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
        let filter = {};
        if (req.user.role === 'college_admin') {
            filter.collegeId = req.user.collegeId;
        } else if (req.user.role === 'super_admin') {
            const targetCollegeId = req.query.collegeId;
            if (targetCollegeId && targetCollegeId !== 'all') {
                filter.collegeId = targetCollegeId;
            }
        }

        const { trainerId } = req.query;
        if (trainerId && trainerId !== 'all') {
            filter.trainerId = trainerId;
        }

        const logs = await TrainingLog.find(filter)
            .populate('trainerId', 'username firstName lastName phone')
            .populate('collegeId', 'name')
            .populate('courseId', 'name code')
            .sort({ logDate: -1, createdAt: -1 });

        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
