const Exam = require('../models/Exam');
const Question = require('../models/Question');
const TrainerExamKey = require('../models/TrainerExamKey');
const StudentAttempt = require('../models/StudentAttempt');
const Student = require('../models/Student');
const Batch = require('../models/Batch');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');


const checkAndAutoEndSession = async (sessionId, io) => {
    if (!sessionId) return;
    try {
        const activeCount = await StudentAttempt.countDocuments({
            sessionId,
            status: { $in: ['started', 'active', 'violated'] }
        });
        if (activeCount === 0) {
            await TrainerExamKey.findByIdAndUpdate(sessionId, { isActive: false });
            if (io) {
                const keyDoc = await TrainerExamKey.findById(sessionId);
                if (keyDoc) {
                    io.to(`exam_${keyDoc.uniqueKey}`).emit('session_ended', { 
                        examKey: keyDoc.uniqueKey, 
                        timestamp: new Date() 
                    });
                    console.log(`Socket broadcast (auto-end): ended session for key: ${keyDoc.uniqueKey}`);
                }
            }
        }
    } catch (e) {
        console.error('Error in checkAndAutoEndSession:', e);
    }
};

exports.getExamByEntryKey = async (req, res) => {
    try {
        const { key } = req.params;
        const { rollNumber } = req.query;

        const query = mongoose.Types.ObjectId.isValid(key)
            ? { $or: [{ uniqueKey: key }, { _id: key }] }
            : { uniqueKey: key };

        const trainerKey = await TrainerExamKey.findOne(query)
            .populate({
                path: 'examId',
                populate: { path: 'collegeId courseId', select: 'name code' }
            });

        if (!trainerKey) {
            return res.status(404).json({ success: false, error: 'Invalid exam key' });
        }

        const exam = trainerKey.examId;
        if (!exam) {
            return res.status(404).json({ success: false, error: 'Exam not found' });
        }

        if (exam.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Exam is not currently published' });
        }

        const now = new Date();
        if (exam.scheduledDate && now < new Date(exam.scheduledDate)) {
            return res.status(403).json({
                success: false,
                error: `This assessment is scheduled to start on ${new Date(exam.scheduledDate).toLocaleString()}`
            });
        }
        if (exam.expiryDate && now > new Date(exam.expiryDate)) {
            return res.status(403).json({ success: false, error: 'This assessment has already expired and is no longer accessible.' });
        }

        if (rollNumber) {
            const student = await Student.findOne({ usn: rollNumber, collegeId: exam.collegeId?._id || exam.collegeId }).populate('batchId');
            if (!student) {
                return res.status(403).json({
                    success: false,
                    error: `Roll Number ${rollNumber} is not registered in the system.`
                });
            }

            const hasTargetedBatches = exam.batches && exam.batches.length > 0;
            const isTargeted = !hasTargetedBatches || 
                               exam.batches.some(b => b.toString() === student.batchId?._id?.toString()) ||
                               (trainerKey?.batchId && trainerKey.batchId.toString() === student.batchId?._id?.toString());
            if (!isTargeted) {
                return res.status(403).json({
                    success: false,
                    error: 'You are not registered in an authorized batch for this assessment.'
                });
            }

            if (student.batchId?.status === 'completed') {
                return res.status(403).json({
                    success: false,
                    error: 'Your batch has already completed, and exam access is restricted.'
                });
            }
        }

        // Fetch questions
        const questions = await Question.find({ examId: exam._id }).sort({ sectionIndex: 1, order: 1 });

        // Check if there's an existing attempt
        let existingAnswers = {};
        let attempt = null;
        if (rollNumber) {
            attempt = await StudentAttempt.findOne({ examId: exam._id, 'studentDetails.rollNumber': rollNumber });
        }

        // Apply session closure blocks AFTER checking if they already completed it
        if (!trainerKey.isActive && (!attempt || attempt.status !== 'completed')) {
            return res.status(403).json({ success: false, error: 'This assessment session has been closed by the instructor.' });
        }

        if (attempt && attempt.status === 'completed') {
            // Return result with review data if already completed
            let questionsForReview;
            if (attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
                const unordered = await Question.find({ _id: { $in: attempt.assignedQuestions } });
                const parsedIds = attempt.assignedQuestions.map(id => id.toString());
                questionsForReview = parsedIds.map(id => unordered.find(q => q._id.toString() === id)).filter(Boolean);
            } else {
                questionsForReview = await Question.find({ examId: exam._id }).sort({ sectionIndex: 1, order: 1 });
            }
            const reviewData = questionsForReview.map(q => {
                const studentAnswer = attempt.answers.find(a => a.questionId.toString() === q._id.toString());
                const correctAnswer = q.type === 'fill_blank' || q.type === 'numeric'
                    ? q.correctAnswerText
                    : q.options?.choices?.filter(c => c.isCorrect).map(c => c.text);
                return {
                    id: q._id,
                    text: q.text,
                    type: q.type,
                    points: q.points,
                    sectionIndex: q.sectionIndex || 0,
                    imageUrl: q.imageUrl,
                    options: q.options?.choices?.map(c => c.text) || [],
                    correctAnswer,
                    studentAnswer: studentAnswer?.answer,
                    isCorrect: studentAnswer?.isCorrect || false,
                    marksObtained: studentAnswer?.marksObtained || 0,
                    timeSpent: studentAnswer?.timeSpent || 0,
                };
            });
            return res.json({
                success: true,
                isCompleted: true,
                data: {
                    score: attempt.totalScore,
                    percentage: attempt.percentage.toFixed(2),
                    totalMarks: exam.totalMarks,
                    passingPercentage: exam.passingPercentage,
                    studentDetails: attempt.studentDetails,
                    examTitle: exam.title,
                    result: attempt.result,
                    attemptId: attempt._id,
                    enableCertificate: exam.settings?.enableCertificate || false,
                    settings: exam.settings || {},
                    sections: exam.sections || [],
                    review: reviewData
                }
            });
        }
        if (attempt) {
            attempt.answers.forEach(a => {
                // Restore single-value answers as a string, multi-value as an array
                const val = a.answer;
                if (Array.isArray(val) && val.length === 1) {
                    existingAnswers[a.questionId.toString()] = val[0];
                } else if (Array.isArray(val) && val.length > 1) {
                    existingAnswers[a.questionId.toString()] = val;
                } else {
                    existingAnswers[a.questionId.toString()] = val;
                }
            });
        }
        let returnQuestions = questions;
        if (rollNumber && attempt && attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
            const assignedIds = attempt.assignedQuestions.map(id => id.toString());
            // Preserve the randomly shuffled order from assignedQuestions
            returnQuestions = assignedIds.map(id => questions.find(q => q._id.toString() === id)).filter(Boolean);
        }

        const sanitizedQuestions = returnQuestions.map(q => ({
            id: q._id,
            text: q.text,
            type: q.type,
            points: q.points,
            sectionIndex: q.sectionIndex || 0,
            options: q.options?.choices?.map(c => c.text) || [],
            codingDetails: q.type === 'coding' ? {
                language: q.codingDetails?.language,
                initialCode: q.codingDetails?.initialCode
            } : undefined
        }));

        res.json({
            success: true,
            data: {
                exam: {
                    id: exam._id,
                    title: exam.title,
                    duration: exam.duration,
                    totalMarks: exam.totalMarks,
                    passingPercentage: exam.passingPercentage,
                    instructions: exam.instructions,
                    college: exam.collegeId?.name,
                    department: exam.department,
                    course: exam.courseId?.name,
                    settings: exam.settings,
                    sections: exam.sections || [],
                    enableCertificate: exam.settings?.enableCertificate || false,
                    scheduledDate: exam.scheduledDate,
                    expiryDate: exam.expiryDate,
                    sessionId: trainerKey._id,
                    trainerId: trainerKey.trainerId,
                    isStarted: trainerKey.isStarted,
                    isPaused: trainerKey.isPaused
                },
                questions: sanitizedQuestions,
                existingAnswers
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getExamSettingsByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const trainerKey = await TrainerExamKey.findOne({ uniqueKey: key });
        if (!trainerKey) return res.status(404).json({ success: false, error: 'Invalid exam key' });

        const exam = await Exam.findById(trainerKey.examId).select('settings title');
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        res.json({ 
            success: true, 
            data: { 
                settings: exam.settings || {}, 
                title: exam.title, 
                isActive: trainerKey.isActive,
                isStarted: trainerKey.isStarted,
                isPaused: trainerKey.isPaused
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.validateExamKey = async (req, res) => {
    try {
        const { key, rollNumber } = req.body;
        const trainerKey = await TrainerExamKey.findOne({ uniqueKey: key });

        if (!trainerKey) {
            return res.status(404).json({ success: false, error: 'Invalid exam key' });
        }

        const exam = await Exam.findById(trainerKey.examId);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        let studentDetails = null;
        if (rollNumber) {
            const student = await Student.findOne({ usn: rollNumber, collegeId: exam.collegeId }).populate('batchId');
            if (!student) {
                return res.status(403).json({
                    success: false,
                    error: `Roll Number ${rollNumber} is not registered in the system.`
                });
            }

            const hasTargetedBatches = exam.batches && exam.batches.length > 0;
            const isTargeted = !hasTargetedBatches || 
                               exam.batches.some(b => b.toString() === student.batchId?._id?.toString()) ||
                               (trainerKey?.batchId && trainerKey.batchId.toString() === student.batchId?._id?.toString());
            if (!isTargeted) {
                return res.status(403).json({
                    success: false,
                    error: 'You are not registered in an authorized batch for this assessment.'
                });
            }

            if (student.batchId?.status === 'completed') {
                return res.status(403).json({
                    success: false,
                    error: 'Your batch has already completed, and exam access is restricted.'
                });
            }

            studentDetails = {
                name: student.name,
                email: student.email,
                mobile: student.mobile,
                department: student.department
            };
        }

        // Check if student has already completed this exam
        const checkAttempt = await StudentAttempt.findOne({
            examId: trainerKey.examId,
            'studentDetails.rollNumber': rollNumber,
            status: 'completed'
        });

        // If not completed and session is closed, block access
        if (!trainerKey.isActive && !checkAttempt) {
            return res.status(403).json({ success: false, error: 'This assessment session has been closed by the instructor.' });
        }

        const now = new Date();
        if (exam.scheduledDate && now < new Date(exam.scheduledDate)) {
            return res.status(403).json({
                success: false,
                error: `This assessment is scheduled to start on ${new Date(exam.scheduledDate).toLocaleString()}`
            });
        }
        if (exam.expiryDate && now > new Date(exam.expiryDate)) {
            return res.status(403).json({ success: false, error: 'This assessment has already expired and is no longer accessible.' });
        }

        // Allow access to view results even if completed
        res.json({
            success: true,
            message: 'Key validated',
            isCompleted: !!checkAttempt,
            settings: exam.settings || {},
            student: studentDetails
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.startAttempt = async (req, res) => {
    try {
        const { examId, sessionId, trainerId, studentDetails } = req.body;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const rollNumber = studentDetails?.rollNumber;
        if (!rollNumber) {
            return res.status(400).json({ success: false, error: 'Roll number is required.' });
        }

        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        const student = await Student.findOne({ usn: rollNumber, collegeId: exam.collegeId }).populate('batchId');
        if (!student) {
            return res.status(403).json({
                success: false,
                error: `Roll Number ${rollNumber} is not registered in the system.`
            });
        }

        // Check if student's batch is targeted by the exam
        const trainerKey = await TrainerExamKey.findById(sessionId);
        const hasTargetedBatches = exam.batches && exam.batches.length > 0;
        const isTargeted = !hasTargetedBatches || 
                           exam.batches.some(b => b.toString() === student.batchId?._id?.toString()) ||
                           (trainerKey?.batchId && trainerKey.batchId.toString() === student.batchId?._id?.toString());
        if (!isTargeted) {
            return res.status(403).json({
                success: false,
                error: 'You are not registered in an authorized batch for this assessment.'
            });
        }

        // Check batch status
        if (student.batchId?.status === 'completed') {
            return res.status(403).json({
                success: false,
                error: 'Your batch has already completed, and exam access is restricted.'
            });
        }

        const verifiedStudentDetails = {
            name: student.name,
            rollNumber: student.usn,
            mobile: student.mobile || '',
            email: student.email || '',
            department: student.department || '',
            college: studentDetails?.college || '',
            course: studentDetails?.course || ''
        };

        let attempt = await StudentAttempt.findOne({
            examId,
            'studentDetails.rollNumber': rollNumber
        });

        if (!attempt) {
            let assignedQuestions = [];

            if (exam) {
                if (exam.settings?.enableSections && exam.sections?.length > 0) {
                    const allQuestions = await Question.find({ examId });
                    let groupedQs = [];
                    const secCount = exam.sections.length;
                    for (let sIdx = 0; sIdx < secCount; sIdx++) {
                        const secQs = allQuestions.filter(q => (q.sectionIndex || 0) === sIdx);
                        if (exam.settings?.randomizeQuestions || exam.settings?.shuffleQuestions) {
                            for (let i = secQs.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [secQs[i], secQs[j]] = [secQs[j], secQs[i]];
                            }
                        }
                        groupedQs = groupedQs.concat(secQs);
                    }
                    if (exam.settings?.randomizeQuestions && exam.settings?.randomQuestionCount > 0) {
                        assignedQuestions = groupedQs.slice(0, exam.settings.randomQuestionCount).map(q => q._id);
                    } else {
                        assignedQuestions = groupedQs.map(q => q._id);
                    }
                } else {
                    if (exam.settings?.randomizeQuestions && exam.settings?.randomQuestionCount > 0) {
                        const allQuestions = await Question.find({ examId }).select('_id');
                        for (let i = allQuestions.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
                        }
                        assignedQuestions = allQuestions.slice(0, exam.settings.randomQuestionCount).map(q => q._id);
                    } else if (exam.settings?.shuffleQuestions) {
                        const allQuestions = await Question.find({ examId }).select('_id');
                        for (let i = allQuestions.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
                        }
                        assignedQuestions = allQuestions.map(q => q._id);
                    }
                }
            }

            attempt = new StudentAttempt({
                examId,
                sessionId,
                trainerId,
                studentDetails: verifiedStudentDetails,
                status: 'started',
                startedAt: new Date(),
                ipAddress,
                userAgent,
                assignedQuestions,
                clientSessionId: crypto.randomUUID()
            });
            try {
                await attempt.save();
            } catch (saveError) {
                if (saveError.code === 11000 || saveError.message?.includes('11000') || saveError.message?.includes('duplicate key')) {
                    attempt = await StudentAttempt.findOne({
                        examId,
                        'studentDetails.rollNumber': rollNumber
                    });
                    if (!attempt) throw saveError;
                    if (attempt.status === 'completed') {
                        return res.json({ success: true, data: attempt, message: 'Attempt already completed' });
                    }
                    attempt.studentDetails = verifiedStudentDetails;
                    if (!attempt.ipAddress) attempt.ipAddress = ipAddress;
                    if (!attempt.userAgent) attempt.userAgent = userAgent;
                    if (!attempt.clientSessionId) attempt.clientSessionId = crypto.randomUUID();
                    await attempt.save();
                } else {
                    throw saveError;
                }
            }
        } else if (attempt.status === 'completed') {
            return res.json({ success: true, data: attempt, message: 'Attempt already completed' });
        } else {
            attempt.studentDetails = verifiedStudentDetails;
            if (!attempt.ipAddress) attempt.ipAddress = ipAddress;
            if (!attempt.userAgent) attempt.userAgent = userAgent;
            if (!attempt.clientSessionId) attempt.clientSessionId = crypto.randomUUID();
            await attempt.save();
        }

        let newQuestions = null;
        if (attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
            const unorderedQuestions = await Question.find({ _id: { $in: attempt.assignedQuestions } });
            // Preserve the randomly shuffled order from assignedQuestions
            const parsedIds = attempt.assignedQuestions.map(id => id.toString());
            const questions = parsedIds.map(id => unorderedQuestions.find(q => q._id.toString() === id)).filter(Boolean);

            newQuestions = questions.map(q => ({
                id: q._id,
                text: q.text,
                type: q.type,
                points: q.points,
                sectionIndex: q.sectionIndex || 0,
                options: q.options?.choices?.map(c => c.text) || [],
                codingDetails: q.type === 'coding' ? {
                    language: q.codingDetails?.language,
                    initialCode: q.codingDetails?.initialCode
                } : undefined
            }));
        }

        res.json({ success: true, data: attempt, newQuestions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateProgress = async (req, res) => {
    try {
        const { examId, rollNumber, questionId, answer, timeSpent } = req.body;
        const answerArr = Array.isArray(answer) ? answer : (answer !== undefined && answer !== null ? [answer] : []);

        // Use findOneAndUpdate to handle race conditions and prevent duplicates
        // 1. First attempt to update an existing answer for this question
        const updated = await StudentAttempt.findOneAndUpdate(
            {
                examId,
                'studentDetails.rollNumber': rollNumber,
                status: { $ne: 'completed' },
                'answers.questionId': questionId
            },
            {
                $set: {
                    'answers.$.answer': answerArr,
                    ...(timeSpent !== undefined ? { 'answers.$.timeSpent': timeSpent } : {})
                }
            },
            { new: true }
        );

        // 2. If no existing answer was found, push a new one
        if (!updated) {
            await StudentAttempt.findOneAndUpdate(
                {
                    examId,
                    'studentDetails.rollNumber': rollNumber,
                    status: { $ne: 'completed' },
                    'answers.questionId': { $ne: questionId } // Ensure we don't push if it somehow exists now
                },
                {
                    $push: {
                        answers: {
                            questionId,
                            answer: answerArr,
                            timeSpent: timeSpent || 0
                        }
                    }
                }
            );
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateViolations = async (req, res) => {
    try {
        const { examId, rollNumber, violations } = req.body;

        await StudentAttempt.findOneAndUpdate(
            {
                examId,
                'studentDetails.rollNumber': rollNumber,
                status: { $ne: 'completed' }
            },
            {
                $set: {
                    'violations.tabSwitches': violations.tabSwitches || 0,
                    'violations.fullScreenExits': violations.fullScreenExits || 0,
                    'violations.copyAttempts': violations.copyAttempts || 0,
                    'violations.devToolsAttempts': violations.devToolsAttempts || 0,
                    'violations.windowBlurs': violations.windowBlurs || 0,
                    'violations.overlaysDetected': violations.overlaysDetected || 0,
                    'violations.idleTimeouts': violations.idleTimeouts || 0
                }
            }
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.submitExamAttempt = async (req, res) => {
    try {
        const { examId, rollNumber, violations, isAutoSubmit } = req.body;

        const attempt = await StudentAttempt.findOne({ examId, 'studentDetails.rollNumber': rollNumber })
            .populate('examId');

        if (!attempt) {
            return res.status(404).json({ success: false, error: 'Attempt not found' });
        }

        if (!isAutoSubmit && attempt.startedAt) {
            const current_time = Date.now();
            const start_time = new Date(attempt.startedAt).getTime();
            if (current_time - start_time < 60000) {
                const remainingSeconds = Math.ceil((60000 - (current_time - start_time)) / 1000);
                return res.status(403).json({
                    success: false,
                    error: `You must wait ${remainingSeconds} more seconds before submitting.`
                });
            }
        }

        if (attempt.status === 'completed') {
            return res.json({
                success: true,
                message: 'Already submitted',
                score: attempt.totalScore,
                percentage: attempt.percentage.toFixed(2),
                totalMarks: attempt.examId.totalMarks,
                attemptId: attempt._id,
                enableCertificate: attempt.examId.settings?.enableCertificate || false,
                settings: attempt.examId.settings || {},
                result: attempt.result
            });
        }

        let questions;
        if (attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
            const unordered = await Question.find({ _id: { $in: attempt.assignedQuestions } });
            const parsedIds = attempt.assignedQuestions.map(id => id.toString());
            questions = parsedIds.map(id => unordered.find(q => q._id.toString() === id)).filter(Boolean);
        } else {
            questions = await Question.find({ examId: attempt.examId._id }).sort({ sectionIndex: 1, order: 1 });
        }
        let totalScore = 0;
        const enableNeg = attempt.examId?.settings?.enableNegativeMarking;
        const negValue = attempt.examId?.settings?.negativeMarkValue || 0;

        const processedQuestionIds = new Set();
        attempt.answers.forEach(a => {
            const qIdStr = a.questionId.toString();
            if (processedQuestionIds.has(qIdStr)) return;
            processedQuestionIds.add(qIdStr);

            const question = questions.find(q => q._id.toString() === qIdStr);
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
                        if (correctChoices.length === ansArr.length && correctChoices.length > 0) {
                            isCorrect = correctChoices.every(c => ansArr.includes(c));
                        }
                    } else if (question.type === 'fill_blank' || question.type === 'fill_blanks') {
                        const ansStr = Array.isArray(ans) ? ans[0] : ans;
                        if (question.correctAnswerText) isCorrect = String(ansStr).trim().toLowerCase() === String(question.correctAnswerText).trim().toLowerCase();
                    } else if (question.type === 'numeric') {
                        const ansStr = Array.isArray(ans) ? ans[0] : ans;
                        const parsedAns = parseFloat(ansStr);
                        const parsedCorrect = parseFloat(question.correctAnswerText);
                        isCorrect = (!isNaN(parsedAns) && !isNaN(parsedCorrect) && parsedAns === parsedCorrect);
                    }
                }

                a.isCorrect = isCorrect;
                if (isCorrect) {
                    a.marksObtained = question.points || 1;
                    totalScore += question.points || 1;
                } else {
                    const hasAnswered = ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.filter(v => v !== null && v !== undefined && v !== '').length > 0);
                    if (enableNeg && hasAnswered) {
                        a.marksObtained = -negValue;
                        totalScore -= negValue;
                    } else {
                        a.marksObtained = 0;
                    }
                }
            }
        });

        attempt.totalScore = Math.max(0, totalScore);
        const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
        attempt.percentage = (totalScore / maxScore) * 100;
        attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
        attempt.status = 'completed';
        attempt.completedAt = new Date();
        if (violations) attempt.violations = violations;

        await attempt.save();

        // Send Brevo Email asynchronously to not block response
        if (attempt.studentDetails && attempt.studentDetails.email) {
            (async () => {
                try {
                    const correctMarksSum = attempt.answers.reduce((sum, a) => {
                        if (!a.isCorrect) return sum;
                        const q = questions.find(qu => qu._id.toString() === a.questionId.toString());
                        return sum + (q?.points || 1);
                    }, 0);
                    const penaltyValue = attempt.examId.settings?.negativeMarkValue || 0.25;
                    const incorrectCount = attempt.answers.filter(a => !a.isCorrect && a.answer && (Array.isArray(a.answer) ? a.answer.some(v => v) : a.answer)).length;
                    const rawPenalty = incorrectCount * penaltyValue;

                    const isPassedText = attempt.result === 'pass' ? 'PASSED ✅' : 'NOT PASSED ❌';
                    const passedColor = attempt.result === 'pass' ? '#10b981' : '#ef4444';

                    const emailSubject = `Assessment Results: ${attempt.examId.title}`;
                    
                    const htmlEmail = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <title>Assessment Results</title>
                            <style>
                                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; background-color: #f8fafc; color: #1e293b; }
                                .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                                .header { background-color: #0f172a; padding: 35px 20px; text-align: center; color: white; }
                                .header h1 { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
                                .header p { font-size: 11px; text-transform: uppercase; color: #004AAD; font-weight: bold; letter-spacing: 0.15em; margin: 8px 0 0 0; }
                                
                                .content { padding: 30px; }
                                .salutation { font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 0; }
                                .intro { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 25px; }
                                
                                .section-title { font-size: 11px; font-weight: 750; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin: 25px 0 15px 0; }
                                
                                .info-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                                .info-table td { padding: 8px 0; font-size: 13px; vertical-align: top; }
                                .info-lbl { font-weight: bold; color: #94a3b8; width: 35%; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
                                .info-val { font-weight: 600; color: #334155; }
                                
                                .score-box { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; border-radius: 12px; padding: 25px; text-align: center; margin-bottom: 25px; }
                                .score-lbl { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 5px 0; }
                                .score-val { font-size: 44px; font-weight: 900; color: #ffffff; line-height: 1; margin: 0; }
                                .score-status { display: inline-block; padding: 6px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; margin-top: 15px; border: 1px solid ${passedColor}4d; background-color: ${passedColor}1a; color: ${passedColor}; }
                                
                                .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 500; }
                            </style>
                        </head>
                        <body>
                            <div class="wrapper">
                                <div class="header">
                                    <h1>Assessment Result Sheet</h1>
                                    <p>Ethnotech Academy Assessment Portal</p>
                                </div>
                                <div class="content">
                                    <p class="salutation">Dear ${attempt.studentDetails.name},</p>
                                    <p class="intro">Congratulations on completing your assessment. Your responses have been processed and evaluated. Below is your detailed result breakdown.</p>
                                    
                                    <div class="score-box">
                                        <p class="score-lbl">Total Score</p>
                                        <p class="score-val">${attempt.percentage.toFixed(2)}%</p>
                                        <span class="score-status">${isPassedText}</span>
                                    </div>
                                    
                                    <p class="section-title">Candidate & Assessment Details</p>
                                    <table class="info-table">
                                        <tr>
                                            <td class="info-lbl">Candidate Name</td>
                                            <td class="info-val">${attempt.studentDetails.name}</td>
                                        </tr>
                                        <tr>
                                            <td class="info-lbl">USN / Roll Number</td>
                                            <td class="info-val">${attempt.studentDetails.rollNumber}</td>
                                        </tr>
                                        <tr>
                                            <td class="info-lbl">Course</td>
                                            <td class="info-val">${attempt.studentDetails.course || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td class="info-lbl">Completed At</td>
                                            <td class="info-val">${new Date(attempt.completedAt).toLocaleString()}</td>
                                        </tr>
                                    </table>
                                    
                                    <p class="section-title">Marks Breakdown</p>
                                    <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0;">
                                        <tr>
                                            <td style="width: 33.33%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; text-align: center;">
                                                <p style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 5px 0;">Gross Marks</p>
                                                <p style="font-size: 18px; font-weight: 800; color: #10b981; margin: 0;">+${correctMarksSum} pts</p>
                                            </td>
                                            <td style="width: 33.33%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; text-align: center;">
                                                <p style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 5px 0;">Penalty Deductions</p>
                                                <p style="font-size: 18px; font-weight: 800; color: #ef4444; margin: 0;">-${rawPenalty.toFixed(2)} pts</p>
                                            </td>
                                            <td style="width: 33.33%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; text-align: center;">
                                                <p style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 5px 0;">Final Marks</p>
                                                <p style="font-size: 18px; font-weight: 800; color: #004AAD; margin: 0;">${attempt.totalScore} / ${maxScore} pts</p>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                <div class="footer">
                                    <p>© ${new Date().getFullYear()} Ethnotech Academy. All rights reserved.</p>
                                    <p style="font-size: 9px; color: #94a3b8; margin-top: 5px;">This is an automated report. Please do not reply directly to this email.</p>
                                </div>
                            </div>
                        </body>
                        </html>
                    `;

                    let transporter = nodemailer.createTransport({
                        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
                        port: parseInt(process.env.SMTP_PORT || '587'),
                        secure: false,
                        auth: {
                            user: process.env.SMTP_USER,
                            pass: process.env.SMTP_PASS
                        }
                    });

                    let info = await transporter.sendMail({
                        from: '"Ethnotech Academy" <narnejaswanth83@gmail.com>',
                        to: attempt.studentDetails.email.trim(),
                        subject: emailSubject,
                        html: htmlEmail
                    });

                    console.log('Brevo SMTP Email Send Result:', info.messageId);
                } catch (err) {
                    console.error('Brevo Email sending failed:', err);
                }
            })();
        }

        await checkAndAutoEndSession(attempt.sessionId, req.app.get('socketio'));

        // Build per-question review data to send back
        const reviewData = questions.map(q => {
            const studentAnswer = attempt.answers.find(a => a.questionId.toString() === q._id.toString());
            const correctAnswer = q.type === 'fill_blank' || q.type === 'numeric'
                ? q.correctAnswerText
                : q.options?.choices?.filter(c => c.isCorrect).map(c => c.text);
            return {
                id: q._id,
                text: q.text,
                type: q.type,
                points: q.points,
                imageUrl: q.imageUrl,
                options: q.options?.choices?.map(c => c.text) || [],
                correctAnswer,
                studentAnswer: studentAnswer?.answer,
                isCorrect: studentAnswer?.isCorrect || false,
                marksObtained: studentAnswer?.marksObtained || 0,
                timeSpent: studentAnswer?.timeSpent || 0,
            };
        });

        res.json({
            success: true,
            message: 'Exam submitted successfully',
            score: totalScore,
            percentage: attempt.percentage.toFixed(2),
            totalMarks: maxScore,
            result: attempt.result,
            attemptId: attempt._id,
            enableCertificate: attempt.examId.settings?.enableCertificate || false,
            settings: attempt.examId.settings || {},
            review: reviewData
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.resumeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const attempt = await StudentAttempt.findOne({ clientSessionId: sessionId }).populate({
            path: 'examId',
            select: 'title settings'
        });

        if (!attempt) {
            return res.status(404).json({ success: false, error: 'Session not found or invalid link.' });
        }

        if (attempt.status === 'completed') {
            return res.status(400).json({ success: false, error: 'This exam has already been submitted.' });
        }

        // Reconnection window validation (3 minutes = 180000ms)
        if (attempt.lastDisconnected) {
            const timeSinceDisconnect = Date.now() - new Date(attempt.lastDisconnected).getTime();
            if (timeSinceDisconnect > 180000) {
                // Expired reconnection window -> Auto evaluate & submit
                let questions;
                if (attempt.assignedQuestions && attempt.assignedQuestions.length > 0) {
                    const unordered = await Question.find({ _id: { $in: attempt.assignedQuestions } });
                    const parsedIds = attempt.assignedQuestions.map(id => id.toString());
                    questions = parsedIds.map(id => unordered.find(q => q._id.toString() === id)).filter(Boolean);
                } else {
                    questions = await Question.find({ examId: attempt.examId._id }).sort({ sectionIndex: 1, order: 1 });
                }
                let totalScore = 0;
                const enableNeg = attempt.examId?.settings?.enableNegativeMarking;
                const negValue = attempt.examId?.settings?.negativeMarkValue || 0;
                
                const processedQuestionIds = new Set();
                attempt.answers.forEach(a => {
                    const qIdStr = a.questionId.toString();
                    if (processedQuestionIds.has(qIdStr)) return;
                    processedQuestionIds.add(qIdStr);

                    const question = questions.find(q => q._id.toString() === qIdStr);
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
                                if (correctChoices.length === ansArr.length && correctChoices.length > 0) {
                                    isCorrect = correctChoices.every(c => ansArr.includes(c));
                                }
                            } else if (question.type === 'fill_blank' || question.type === 'fill_blanks') {
                                const ansStr = Array.isArray(ans) ? ans[0] : ans;
                                if (question.correctAnswerText) isCorrect = String(ansStr).trim().toLowerCase() === String(question.correctAnswerText).trim().toLowerCase();
                            } else if (question.type === 'numeric') {
                                const ansStr = Array.isArray(ans) ? ans[0] : ans;
                                const parsedAns = parseFloat(ansStr);
                                const parsedCorrect = parseFloat(question.correctAnswerText);
                                isCorrect = (!isNaN(parsedAns) && !isNaN(parsedCorrect) && parsedAns === parsedCorrect);
                            }
                        }

                        a.isCorrect = isCorrect;
                        if (isCorrect) {
                            a.marksObtained = question.points || 1;
                            totalScore += question.points || 1;
                        } else {
                            const hasAnswered = ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.filter(v => v !== null && v !== undefined && v !== '').length > 0);
                            if (enableNeg && hasAnswered) {
                                a.marksObtained = -negValue;
                                totalScore -= negValue;
                            } else {
                                a.marksObtained = 0;
                            }
                        }
                    }
                });

                attempt.totalScore = Math.max(0, totalScore);
                const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
                attempt.percentage = (totalScore / maxScore) * 100;
                attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
                attempt.status = 'completed';
                attempt.completedAt = new Date();
                if (!attempt.violations) attempt.violations = {};
                attempt.violations.reason = 'Reconnection window expired. Exam auto-submitted.';
                
                await attempt.save();
                await checkAndAutoEndSession(attempt.sessionId, req.app.get('socketio'));
                return res.status(403).json({ success: false, error: 'Reconnection window expired. Exam auto-submitted.' });
            }
        }

        attempt.resumeCount = (attempt.resumeCount || 0) + 1;
        attempt.lastDisconnected = null; // Clear it since they are reconnected
        await attempt.save();

        res.json({
            success: true,
            data: {
                examId: attempt.examId._id,
                examKey: attempt.sessionId, // We stored TrainerExamKey ID here
                studentName: attempt.studentDetails.name,
                rollNumber: attempt.studentDetails.rollNumber,
                department: attempt.studentDetails.department,
                mobile: attempt.studentDetails.mobile,
                email: attempt.studentDetails.email
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.pollExamSessionState = async (req, res) => {
    try {
        const { key, rollNumber } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key })
            .populate({ path: 'examId', select: 'duration' })
            .lean();
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid exam key' });

        // Fetch chat history for this exam key
        const ChatMessage = require('../models/ChatMessage');
        const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId?._id })
            .select('uniqueKey')
            .lean();
        const keysList = allKeys.map(k => k.uniqueKey);

        const clientChatCount = req.query.chatCount !== undefined ? parseInt(req.query.chatCount, 10) : null;
        let chatMessages = undefined;

        // Fetch total chat message count first
        const currentChatCount = await ChatMessage.countDocuments({ examKey: { $in: keysList } });
        if (clientChatCount === null || currentChatCount !== clientChatCount) {
            chatMessages = await ChatMessage.find({ examKey: { $in: keysList } })
                .sort({ createdAt: 1 })
                .limit(200)
                .lean();
        }

        // Calculate student's remaining time
        let remainingSeconds = (keyDoc.examId?.duration || 0) * 60;
        if (rollNumber) {
            const attempt = await StudentAttempt.findOne({ 
                examId: keyDoc.examId?._id, 
                'studentDetails.rollNumber': rollNumber 
            })
            .select('startedAt')
            .lean();
            
            if (attempt && attempt.startedAt) {
                const totalDurationSeconds = ((keyDoc.examId?.duration || 0) + (keyDoc.extraTime || 0)) * 60;
                let totalPause = keyDoc.accumulatedPauseTime || 0;
                if (keyDoc.isPaused && keyDoc.pausedAt) {
                    totalPause += Math.floor((Date.now() - new Date(keyDoc.pausedAt).getTime()) / 1000);
                }
                const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000) - totalPause;
                remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
            }
        }

        res.json({
            success: true,
            data: {
                isStarted: keyDoc.isStarted,
                isPaused: keyDoc.isPaused,
                isEnded: !keyDoc.isActive,
                latestBroadcast: keyDoc.latestBroadcast || null,
                remainingSeconds,
                ...(chatMessages !== undefined ? {
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
                } : {})
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.sendChatMessage = async (req, res) => {
    try {
        const { examKey, senderRole, senderName, senderId, message, recipientId } = req.body;
        const ChatMessage = require('../models/ChatMessage');
        const chatMsg = await ChatMessage.create({
            examKey,
            senderRole,
            senderName,
            senderId,
            message,
            recipientId: recipientId || null
        });

        // Emit via socket if active
        const io = req.app.get('socketio');
        if (io) {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
                allKeys.forEach(k => {
                    io.to(`exam_${k.uniqueKey}`).emit('chat_message', {
                        id: chatMsg._id,
                        examKey: k.uniqueKey,
                        senderRole,
                        senderName,
                        senderId,
                        message,
                        recipientId: recipientId || null,
                        timestamp: chatMsg.createdAt
                    });
                });
            } else {
                io.to(`exam_${examKey}`).emit('chat_message', {
                    id: chatMsg._id,
                    examKey,
                    senderRole,
                    senderName,
                    senderId,
                    message,
                    recipientId: recipientId || null,
                    timestamp: chatMsg.createdAt
                });
            }
        }

        res.json({ success: true, data: chatMsg });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.sendBroadcast = async (req, res) => {
    try {
        const { examKey, message, trainerName } = req.body;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
        const latestBroadcast = { message, timestamp: new Date() };

        if (keyDoc) {
            const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
            const keyIds = allKeys.map(k => k._id);
            await TrainerExamKey.updateMany(
                { _id: { $in: keyIds } },
                { latestBroadcast }
            );

            const io = req.app.get('socketio');
            if (io) {
                allKeys.forEach(k => {
                    io.to(`exam_${k.uniqueKey}`).emit('broadcast_announcement', {
                        message,
                        trainerName,
                        timestamp: new Date()
                    });
                });
            }
        } else {
            const io = req.app.get('socketio');
            if (io) {
                io.to(`exam_${examKey}`).emit('broadcast_announcement', { message, trainerName, timestamp: new Date() });
            }
        }

        res.json({ success: true, message: 'Broadcast sent successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

