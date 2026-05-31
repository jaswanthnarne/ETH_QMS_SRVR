const Exam = require('../models/Exam');
const Question = require('../models/Question');
const TrainerExamKey = require('../models/TrainerExamKey');
const StudentAttempt = require('../models/StudentAttempt');
const crypto = require('crypto');

exports.getExamByEntryKey = async (req, res) => {
    try {
        const { key } = req.params;
        const { rollNumber } = req.query;

        const trainerKey = await TrainerExamKey.findOne({ uniqueKey: key })
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

        // Fetch questions
        const questions = await Question.find({ examId: exam._id }).sort({ order: 1 });

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
            const questionsForReview = await Question.find({ examId: exam._id }).sort({ order: 1 });
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
            settings: exam.settings || {}
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

        let attempt = await StudentAttempt.findOne({
            examId,
            'studentDetails.rollNumber': studentDetails.rollNumber
        });

        if (!attempt) {
            const exam = await Exam.findById(examId);
            let assignedQuestions = [];

            if (exam) {
                if (exam.settings?.randomizeQuestions && exam.settings?.randomQuestionCount > 0) {
                    const allQuestions = await Question.find({ examId }).select('_id');
                    // Fisher-Yates shuffle
                    for (let i = allQuestions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
                    }
                    assignedQuestions = allQuestions.slice(0, exam.settings.randomQuestionCount).map(q => q._id);
                } else if (exam.settings?.shuffleQuestions) {
                    const allQuestions = await Question.find({ examId }).select('_id');
                    // Fisher-Yates shuffle
                    for (let i = allQuestions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
                    }
                    assignedQuestions = allQuestions.map(q => q._id);
                }
            }

            attempt = new StudentAttempt({
                examId,
                sessionId,
                trainerId,
                studentDetails,
                status: 'started',
                startedAt: new Date(),
                ipAddress,
                userAgent,
                assignedQuestions,
                clientSessionId: crypto.randomUUID()
            });
            await attempt.save();
        } else if (attempt.status === 'completed') {
            return res.json({ success: true, data: attempt, message: 'Attempt already completed' });
        } else {
            attempt.studentDetails = { ...attempt.studentDetails, ...studentDetails };
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

        const questions = await Question.find({ examId: attempt.examId._id });
        let totalScore = 0;

        const processedQuestionIds = new Set();
        attempt.answers.forEach(a => {
            const qIdStr = a.questionId.toString();
            if (processedQuestionIds.has(qIdStr)) return;
            processedQuestionIds.add(qIdStr);

            const question = questions.find(q => q._id.toString() === qIdStr);
            if (question) {
                let isCorrect = false;
                const ans = a.answer;

                if (ans !== undefined && ans !== null && ans !== '') {
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
                    a.marksObtained = 0;
                }
            }
        });

        attempt.totalScore = totalScore;
        const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
        attempt.percentage = (totalScore / maxScore) * 100;
        attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
        attempt.status = 'completed';
        attempt.completedAt = new Date();
        if (violations) attempt.violations = violations;

        await attempt.save();

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
                const questions = await Question.find({ examId: attempt.examId._id });
                let totalScore = 0;
                
                const processedQuestionIds = new Set();
                attempt.answers.forEach(a => {
                    const qIdStr = a.questionId.toString();
                    if (processedQuestionIds.has(qIdStr)) return;
                    processedQuestionIds.add(qIdStr);

                    const question = questions.find(q => q._id.toString() === qIdStr);
                    if (question) {
                        let isCorrect = false;
                        const ans = a.answer;

                        if (ans !== undefined && ans !== null && ans !== '') {
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
                            a.marksObtained = 0;
                        }
                    }
                });

                attempt.totalScore = totalScore;
                const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
                attempt.percentage = (totalScore / maxScore) * 100;
                attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
                attempt.status = 'completed';
                attempt.completedAt = new Date();
                if (!attempt.violations) attempt.violations = {};
                attempt.violations.reason = 'Reconnection window expired. Exam auto-submitted.';
                
                await attempt.save();
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

