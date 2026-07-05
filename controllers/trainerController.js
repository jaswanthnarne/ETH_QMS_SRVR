const mongoose = require('mongoose');
const TrainerExamKey = require('../models/TrainerExamKey');
const Exam = require('../models/Exam');
const StudentAttempt = require('../models/StudentAttempt');
const User = require('../models/User');
const Batch = require('../models/Batch');
const TrainingLog = require('../models/TrainingLog');

// GET /api/trainer/exams
// Returns only PUBLISHED exams from the trainer's assigned courses
exports.getAssignedExams = async (req, res) => {
    try {
        const trainerId = req.user._id;
        const collegeId = req.query.collegeId;

        // Get all keys for this trainer
        const assignedKeys = await TrainerExamKey.find({ trainerId })
            .populate({
                path: 'examId',
                populate: [
                    { path: 'courseId', select: 'name code' },
                    { path: 'collegeId', select: 'name' }
                ]
            })
            .populate('batchId', 'batchName');

        // The key is the assignment. Only hide unpublished/deleted exams.
        const formattedExams = assignedKeys
            .filter(ak => {
                if (!ak.examId || ak.examId.status !== 'published') return false;
                if (collegeId && ak.examId.collegeId?._id?.toString() !== collegeId) return false;
                return true;
            })
            .map(ak => ({
                id: ak._id,
                examId: ak.examId?._id,
                title: ak.examId?.title,
                batchName: ak.batchId?.batchName || 'General',
                course: ak.examId?.courseId?.name || '—',
                courseCode: ak.examId?.courseId?.code || '—',
                college: ak.examId?.collegeId?.name || '—',
                key: ak.uniqueKey,
                status: ak.examId?.status,
                duration: ak.examId?.duration,
                totalMarks: ak.examId?.totalMarks,
                passingPercentage: ak.examId?.passingPercentage || 40,
                settings: ak.examId?.settings
            }));

        res.json({ success: true, data: formattedExams });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/stats
exports.getTrainerStats = async (req, res) => {
    try {
        const trainerId = req.user._id;
        const collegeId = req.query.collegeId;

        // Perform parallel fast count queries
        let keyQuery = { trainerId };
        let assignedExamsCount = 0;
        
        if (collegeId) {
            const examsForCollege = await Exam.find({ collegeId }).select('_id');
            const examIds = examsForCollege.map(e => e._id);
            assignedExamsCount = await TrainerExamKey.countDocuments({ trainerId, examId: { $in: examIds } });
        } else {
            assignedExamsCount = await TrainerExamKey.countDocuments({ trainerId });
        }

        let batchQuery = { trainerId };
        if (collegeId) batchQuery.collegeId = collegeId;

        let logQuery = { trainerId };
        if (collegeId) logQuery.collegeId = collegeId;

        const [totalBatches, totalLogs, trainer] = await Promise.all([
            Batch.countDocuments(batchQuery),
            TrainingLog.countDocuments(logQuery),
            User.findById(trainerId).select('assignedCourses')
        ]);

        let totalCourses = trainer?.assignedCourses?.length || 0;
        if (collegeId) {
            const Course = require('../models/Course');
            totalCourses = await Course.countDocuments({
                _id: { $in: trainer?.assignedCourses || [] },
                collegeId
            });
        }

        let attemptMatch = { trainerId };
        if (collegeId) {
            const examsForCollege = await Exam.find({ collegeId }).select('_id');
            const examIds = examsForCollege.map(e => e._id);
            attemptMatch.examId = { $in: examIds };
        }

        // Fast Single Aggregation Group for Overall stats
        const overallStats = await StudentAttempt.aggregate([
            { $match: attemptMatch },
            {
                $group: {
                    _id: null,
                    totalAttempts: { $sum: 1 },
                    passedAttempts: { $sum: { $cond: [{ $eq: ["$result", "pass"] }, 1, 0] } },
                    totalPercentage: { $sum: { $ifNull: ["$percentage", 0] } }
                }
            }
        ]);

        const totalAttempts = overallStats[0]?.totalAttempts || 0;
        const totalPassed = overallStats[0]?.passedAttempts || 0;
        const passRate = totalAttempts > 0 ? ((totalPassed / totalAttempts) * 100).toFixed(0) : 0;
        const avgScore = totalAttempts > 0 ? (overallStats[0].totalPercentage / totalAttempts).toFixed(1) : 0;

        // Fast Aggregation Group for Exam Breakdown
        const breakdownStats = await StudentAttempt.aggregate([
            { $match: attemptMatch },
            {
                $group: {
                    _id: "$examId",
                    total: { $sum: 1 },
                    passed: { $sum: { $cond: [{ $eq: ["$result", "pass"] }, 1, 0] } },
                    totalPercentage: { $sum: { $ifNull: ["$percentage", 0] } }
                }
            }
        ]);

        // Bulk load all referenced exams to solve the N+1 problem
        const examIds = breakdownStats.map(r => r._id).filter(Boolean);
        const exams = await Exam.find({ _id: { $in: examIds } })
            .select('title courseId')
            .populate('courseId', 'name code')
            .lean();

        const examMap = {};
        exams.forEach(e => {
            examMap[e._id.toString()] = e;
        });

        const examBreakdown = breakdownStats.map(r => {
            const examDoc = r._id ? examMap[r._id.toString()] : null;
            return {
                examId: r._id,
                title: examDoc?.title || '—',
                course: examDoc?.courseId?.name || '—',
                total: r.total,
                passed: r.passed,
                avgScore: r.total > 0 ? (r.totalPercentage / r.total).toFixed(1) : 0,
                passRate: r.total > 0 ? ((r.passed / r.total) * 100).toFixed(0) : 0
            };
        });

        res.json({
            success: true,
            data: { 
                totalExams: assignedExamsCount, 
                completedSessions: totalAttempts, 
                averagePassRate: passRate, 
                avgScore, 
                totalBatches,
                totalLogs,
                totalCourses,
                examBreakdown 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/waiting-room/:key
// Returns students currently in waiting room (joined but not yet started, or active)
exports.getWaitingRoom = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id })
            .populate({ path: 'examId', populate: [{ path: 'courseId', select: 'name code' }, { path: 'collegeId', select: 'name' }] });

        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid exam key or not authorized' });

        // Find all active keys for this exam by this trainer
        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId?._id, trainerId: req.user._id, isActive: true });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        // Get attempts for all these keys (sessions)
        const attempts = await StudentAttempt.find({ sessionId: { $in: keyIds } })
            .select('studentDetails status totalScore percentage result startedAt completedAt violations');

        const ChatMessage = require('../models/ChatMessage');
        const chatMessages = await ChatMessage.find({ examKey: { $in: [keyDoc.uniqueKey, ...allKeys.map(k => k.uniqueKey)] } })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean();

        res.json({
            success: true,
            data: {
                exam: {
                    id: keyDoc.examId?._id,
                    title: keyDoc.examId?.title,
                    course: keyDoc.examId?.courseId?.name,
                    courseCode: keyDoc.examId?.courseId?.code,
                    college: keyDoc.examId?.collegeId?.name,
                    duration: keyDoc.examId?.duration,
                    totalMarks: keyDoc.examId?.totalMarks,
                    passingPercentage: keyDoc.examId?.passingPercentage || 40,
                    settings: keyDoc.examId?.settings,
                    key: keyDoc.uniqueKey,
                    isStarted: keyDoc.isStarted,
                    isPaused: keyDoc.isPaused,
                    isActive: keyDoc.isActive
                },
                students: attempts.map(a => ({
                    id: a._id,
                    name: a.studentDetails?.name,
                    rollNumber: a.studentDetails?.rollNumber,
                    mobile: a.studentDetails?.mobile,
                    department: a.studentDetails?.department,
                    status: a.status,
                    score: a.totalScore,
                    percentage: a.percentage,
                    result: a.result,
                    startedAt: a.startedAt,
                    completedAt: a.completedAt,
                    violations: (a.violations?.tabSwitches || 0) + (a.violations?.fullScreenExits || 0) + (a.violations?.copyAttempts || 0)
                })),
                chatMessages: chatMessages.map(m => ({
                    id: m._id,
                    examKey: m.examKey,
                    senderRole: m.senderRole,
                    senderName: m.senderName,
                    senderId: m.senderId,
                    message: m.message,
                    recipientId: m.recipientId,
                    timestamp: m.createdAt
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/waiting-room/:key/start
exports.startSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne(
            { uniqueKey: key, trainerId: req.user._id, isActive: true }
        ).populate('examId');

        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        // Update all active keys of this exam for this trainer
        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId?._id, trainerId: req.user._id, isActive: true });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        await TrainerExamKey.updateMany(
            { _id: { $in: keyIds } },
            { isStarted: true }
        );

        const Notification = require('../models/Notification');
        const trainerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.phone || req.user.username;
        
        // Avoid duplicate start notifications for the same session
        const existing = await Notification.findOne({
            type: 'exam_started',
            message: { $regex: key }
        });

        if (!existing) {
            const notif = await Notification.create({
                title: 'Exam Session Started',
                message: `Trainer ${trainerName} started the exam session for "${keyDoc.examId?.title || 'Exam'}" (Key: ${key}).`,
                type: 'exam_started',
                collegeId: keyDoc.examId?.collegeId
            });

            // Emit socket notification to active listeners real-time
            const io = req.app.get('socketio');
            if (io) {
                io.emit('new_notification', {
                    ...notif.toObject(),
                    isRead: false
                });
            }
        }
        
        res.json({ success: true, message: 'Session started successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/course-exams
// Get all exams created by the trainer, regardless of status
exports.getTrainerExams = async (req, res) => {
    try {
        const collegeId = req.query.collegeId;
        const filter = { createdBy: req.user._id };
        if (collegeId && mongoose.Types.ObjectId.isValid(collegeId)) {
            filter.collegeId = collegeId;
        }
        
        const exams = await Exam.find(filter)
            .populate('courseId', 'name code')
            .populate('collegeId', 'name')
            .sort({ createdAt: -1 });

        // Include any keys already assigned to this trainer for these exams
        const keys = await TrainerExamKey.find({ trainerId: req.user._id }).populate('batchId', 'batchName');
        const Question = require('../models/Question');

        const data = await Promise.all(exams.map(async (e) => {
            const examKeys = keys.filter(k => k.examId.toString() === e._id.toString());
            const questionCount = await Question.countDocuments({ examId: e._id });
            return {
                id: e._id,
                title: e.title,
                course: e.courseId?.name,
                courseCode: e.courseId?.code,
                college: e.collegeId?.name,
                duration: e.duration,
                passingPercentage: e.passingPercentage || 40,
                totalMarks: e.totalMarks,
                status: e.status, // draft or published
                trainerKey: examKeys.length > 0 ? examKeys[0].uniqueKey : null,
                trainerKeys: examKeys.map(k => ({ key: k.uniqueKey, batchName: k.batchId ? k.batchId.batchName : 'General' })),
                isStarted: examKeys.some(k => k.isStarted),
                createdBy: e.createdBy,
                questionCount
            };
        }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/exams/:id/publish
// Let trainer independently generate a key and open the session
exports.publishTrainerExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id).populate('courseId');
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        const trainer = await User.findById(req.user._id);

        // Ensure this trainer created the exam
        if (exam.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to publish this exam' });
        }

        // Generate keys for targeted batches. If no batches are targeted, generate a single General key.
        const targetBatches = exam.batches && exam.batches.length > 0 ? exam.batches : [null];
        const batchesDetails = await Batch.find({ _id: { $in: exam.batches || [] } });
        const batchMap = new Map(batchesDetails.map(b => [b._id.toString(), b]));

        let primaryKey = '';

        for (const batchId of targetBatches) {
            const batch = batchId ? batchMap.get(batchId.toString()) : null;
            // Clean slug: uppercase, alphanumeric, max 4 chars
            const batchCode = batch 
                ? batch.batchName.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase() 
                : null;

            // Check if key already exists for this batch, trainer, exam
            let existingKey = await TrainerExamKey.findOne({ 
                examId: exam._id, 
                trainerId: trainer._id, 
                batchId: batch ? batch._id : null 
            });

            if (!existingKey) {
                const crypto = require('crypto');
                const randomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
                const examShort = exam.title.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase() || 'EX';
                const uniqueKey = batchCode 
                    ? `${exam.courseId?.code || 'CRS'}-${examShort}-${batchCode}-${randomCode}`
                    : `${exam.courseId?.code || 'CRS'}-${examShort}-${randomCode}`;

                existingKey = await TrainerExamKey.create({
                    examId: exam._id,
                    trainerId: trainer._id,
                    batchId: batch ? batch._id : null,
                    uniqueKey
                });
            }

            if (!primaryKey) {
                primaryKey = existingKey.uniqueKey;
            }
        }

        // Technically, once ANY trainer publishes it, the overall exam status becomes 'published'
        if (exam.status !== 'published') {
            exam.status = 'published';
            await exam.save();
        }

        const Notification = require('../models/Notification');
        const trainerName = `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() || trainer.phone || trainer.username || 'Trainer';
        const notif = await Notification.create({
            title: 'Trainer Published Assessment',
            message: `${trainerName} published "${exam.title}" and generated an access key.`,
            type: 'exam_published',
            collegeId: exam.collegeId,
            targetRoles: ['super_admin', 'college_admin', 'trainer'],
            targetUsers: [trainer._id]
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

        res.json({ success: true, message: 'Exam published and access key ready', key: primaryKey });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/waiting-room/:key/force-submit
// Trainer manually ends the exam for all active students
exports.forceSubmitSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id, isActive: true });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        // Find all active keys for this exam and trainer
        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id, isActive: true });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        const activeAttempts = await StudentAttempt.find({ 
            sessionId: { $in: keyIds },
            status: { $in: ['started', 'active', 'violated'] } 
        }).populate('examId');

        // Logic from examController's submit operation but applied in batch
        const Question = require('../models/Question');
        const allExamQuestions = await Question.find({ examId: keyDoc.examId });

        for (const attempt of activeAttempts) {
            let attemptQuestions;
            if (attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
                const parsedIds = attempt.assignedQuestions.map(id => id.toString());
                attemptQuestions = parsedIds.map(id => allExamQuestions.find(q => q._id.toString() === id)).filter(Boolean);
            } else {
                attemptQuestions = allExamQuestions;
            }

            let totalScore = 0;
            attempt.answers.forEach(a => {
                const question = attemptQuestions.find(qu => qu._id.toString() === a.questionId.toString());
                if (question) {
                    let isCorrect = false;
                    const ans = a.answer;
                    if (ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.filter(v => v !== null && v !== undefined && v !== '').length > 0)) {
                        if (question.type === 'single_correct' || question.type === 'true_false' || question.type === 'mcq') {
                            const correctChoice = question.options?.choices?.find(c => c.isCorrect);
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            if (correctChoice) isCorrect = String(ansStr).trim().toLowerCase() === String(correctChoice.text).trim().toLowerCase();
                        } else if (question.type === 'multiple_correct' || question.type === 'multiple') {
                            const correctChoices = question.options?.choices?.filter(c => c.isCorrect).map(c => String(c.text).trim().toLowerCase()) || [];
                            const ansArr = Array.isArray(ans) ? ans.map(x => String(x).trim().toLowerCase()) : [String(ans).trim().toLowerCase()];
                            if (correctChoices.length === ansArr.length && correctChoices.length > 0) isCorrect = correctChoices.every(c => ansArr.includes(c));
                        } else if (question.type === 'fill_blank' || question.type === 'fill_blanks') {
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            if (question.correctAnswerText) isCorrect = String(ansStr).trim().toLowerCase() === String(question.correctAnswerText).trim().toLowerCase();
                        } else if (question.type === 'numeric') {
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            const parsedAns = parseFloat(ansStr); const parsedCorrect = parseFloat(question.correctAnswerText);
                            isCorrect = (!isNaN(parsedAns) && !isNaN(parsedCorrect) && parsedAns === parsedCorrect);
                        }
                    }
                    a.isCorrect = isCorrect;
                    if (isCorrect) {
                        a.marksObtained = question.points || 1;
                        totalScore += question.points || 1;
                    } else {
                        a.marksObtained = 0;
                    }
                }
            });

            const maxScore = attempt.examId.totalMarks || attemptQuestions.reduce((acc, q) => acc + q.points, 0) || 1;
            attempt.totalScore = totalScore;
            attempt.percentage = (totalScore / maxScore) * 100;
            attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
            attempt.status = 'completed';
            attempt.completedAt = new Date();
            if (!attempt.violations?.reason) attempt.violations = { ...attempt.violations, reason: 'Force-submitted by Trainer' };
            await attempt.save();
        }

        // Deactivate all these keys
        await TrainerExamKey.updateMany(
            { _id: { $in: keyIds } },
            { isActive: false }
        );

        res.json({ success: true, message: `Force-submitted ${activeAttempts.length} active sessions and ended the exam.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.pauseSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id, isActive: true });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        await TrainerExamKey.updateMany(
            { _id: { $in: keyIds } },
            { isPaused: true, pausedAt: new Date() }
        );
        res.json({ success: true, message: 'Session paused successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.resumeSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id, isActive: true });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        const activeKeys = await TrainerExamKey.find({ _id: { $in: keyIds } });
        for (const k of activeKeys) {
            let addPause = 0;
            if (k.pausedAt) {
                addPause = Math.floor((Date.now() - new Date(k.pausedAt).getTime()) / 1000);
            }
            k.isPaused = false;
            k.accumulatedPauseTime = (k.accumulatedPauseTime || 0) + addPause;
            k.pausedAt = null;
            await k.save();
        }

        res.json({ success: true, message: 'Session resumed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.restartSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id });
        const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

        await TrainerExamKey.updateMany(
            { _id: { $in: keyIds } },
            { isActive: true, isPaused: false, isStarted: true }
        );
        res.json({ success: true, message: 'Session restarted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/my-colleges-courses
exports.getTrainerCollegesAndCourses = async (req, res) => {
    try {
        const College = require('../models/College');
        const Course = require('../models/Course');

        const [colleges, courses] = await Promise.all([
            College.find({}),
            Course.find({}).populate('collegeId', 'name')
        ]);
            
        res.json({
            success: true,
            data: {
                colleges: colleges || [],
                courses: courses || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /api/trainer/waiting-room/:key/attempts/:attemptId
// Trainer resets/deletes a student's attempt to let them retake the exam
exports.resetStudentAttempt = async (req, res) => {
    try {
        const { key, attemptId } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const attempt = await StudentAttempt.findById(attemptId);
        if (!attempt) return res.status(404).json({ success: false, error: 'Attempt not found' });

        // Ensure this attempt belongs to the correct exam
        if (attempt.examId.toString() !== keyDoc.examId.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized attempt reset' });
        }

        const rollNumber = attempt.studentDetails?.rollNumber;

        await attempt.deleteOne();
        
        try {
            const { logAudit } = require('../utils/auditHelper');
            await logAudit(req, 'RESET_STUDENT_ATTEMPT', 'StudentAttempt', attemptId, `Reset attempt for roll: ${rollNumber}`);
        } catch (auditErr) {
            console.error('Audit logging failed for resetStudentAttempt:', auditErr);
        }

        // Notify client-student via socket if active to force reload
        const io = req.app.get('socketio');
        if (io) {
            // Find all active keys for this exam to cover multi-batch
            const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id, isActive: true });
            allKeys.forEach(k => {
                const roomId = `exam_${k.uniqueKey}`;
                io.to(roomId).emit('session_ended', { resetRollNumber: rollNumber, timestamp: new Date() });
            });
        }

        res.json({ success: true, message: 'Student attempt reset successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.addExtraTime = async (req, res) => {
    try {
        const { key } = req.params;
        const { minutes } = req.body;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: req.user._id, isActive: true });
        const keyIds = allKeys.map(k => k._id);

        await TrainerExamKey.updateMany(
            { _id: { $in: keyIds } },
            { $inc: { extraTime: Number(minutes) } }
        );

        // Notify active socket clients about the time addition
        const io = req.app.get('socketio');
        if (io) {
            allKeys.forEach(k => {
                io.to(`exam_${k.uniqueKey}`).emit('time_added', {
                    minutes: Number(minutes),
                    timestamp: new Date()
                });
            });
        }

        res.json({ success: true, message: `Successfully added ${minutes} minutes of extra time.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

