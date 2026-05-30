const express = require('express');
const router = express.Router();
const { 
    getExamByEntryKey, 
    submitExamAttempt, 
    validateExamKey, 
    startAttempt, 
    updateProgress,
    getExamSettingsByKey,
    resumeSession
} = require('../controllers/examController');
const { generateCertificate } = require('../utils/certificateGenerator');
const StudentAttempt = require('../models/StudentAttempt');
const Exam = require('../models/Exam');
const Course = require('../models/Course');
const College = require('../models/College');

router.get('/settings/:key', getExamSettingsByKey);
router.get('/details/:key', getExamByEntryKey);
router.post('/submit', submitExamAttempt);
router.post('/validate-key', validateExamKey);
router.post('/start-attempt', startAttempt);
router.post('/update-progress', updateProgress);
router.get('/resume/:sessionId', resumeSession);

// Student-accessible certificate download (no auth, uses rollNumber + attemptId as verification)
// GET /api/exam/certificate/:attemptId?rollNumber=xxx
router.get('/certificate/:attemptId', async (req, res) => {
    try {
        const { rollNumber } = req.query;
        const attempt = await StudentAttempt.findById(req.params.attemptId).populate('examId');
        
        if (!attempt) return res.status(404).json({ success: false, error: 'Attempt not found' });
        if (rollNumber && attempt.studentDetails?.rollNumber !== rollNumber) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        if (attempt.result !== 'pass') {
            return res.status(400).json({ success: false, error: 'Certificate only available for passed students' });
        }

        const exam = attempt.examId;
        const course = await Course.findById(exam.courseId).select('name');
        const college = await College.findById(exam.collegeId).select('name');

        const pdfBuffer = await generateCertificate({
            studentName: attempt.studentDetails.name,
            rollNumber: attempt.studentDetails.rollNumber,
            examTitle: exam.title,
            courseName: course?.name || '',
            collegeName: college?.name || '',
            score: attempt.totalScore,
            totalMarks: exam.totalMarks,
            percentage: attempt.percentage?.toFixed(1),
            date: attempt.completedAt 
                ? new Date(attempt.completedAt).toLocaleDateString('en-IN') 
                : undefined
        });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Certificate_${attempt.studentDetails.rollNumber}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
