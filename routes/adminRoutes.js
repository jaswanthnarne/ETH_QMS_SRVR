const express = require('express');
const path = require('path');
const router = express.Router();
const { 
    getColleges, createCollege, updateCollege, deleteCollege,
    getCourses, createCourse, updateCourse, deleteCourse,
    getTrainers, createTrainer, updateTrainer, deleteTrainer,
    createExam, getExams, getExamById, updateExam, publishExam, unpublishExam, parseDocument, getAllotments, deleteExam,
    getDashboardStats, bulkImportQuestions, cloneExam, getAdminTrainingLogs
} = require('../controllers/adminController');
const { getBatches } = require('../controllers/batchController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require protection
router.use(protect);

router.get('/dashboard-stats', authorize('super_admin', 'college_admin'), getDashboardStats);

// Colleges (Admin & Trainers)
router.get('/colleges', authorize('super_admin', 'college_admin', 'trainer'), getColleges);
router.post('/colleges', authorize('super_admin', 'college_admin'), createCollege);
router.put('/colleges/:id', authorize('super_admin', 'college_admin'), updateCollege);
router.delete('/colleges/:id', authorize('super_admin', 'college_admin', 'trainer'), deleteCollege);

// Courses
router.get('/courses', authorize('super_admin', 'college_admin', 'trainer'), getCourses); 
router.post('/courses', authorize('super_admin', 'college_admin', 'trainer'), createCourse);
router.get('/colleges/:collegeId/courses', authorize('super_admin', 'college_admin', 'trainer'), getCourses);
router.post('/colleges/:collegeId/courses', authorize('super_admin', 'college_admin', 'trainer'), createCourse);
router.put('/courses/:id', authorize('super_admin', 'college_admin', 'trainer'), updateCourse);
router.delete('/courses/:id', authorize('super_admin', 'college_admin', 'trainer'), deleteCourse);

// Batches
router.get('/colleges/:collegeId/batches', authorize('super_admin', 'college_admin', 'trainer'), getBatches);

// Trainers (Admin only)
router.get('/trainers', authorize('super_admin', 'college_admin'), getTrainers);
router.post('/trainers', authorize('super_admin', 'college_admin'), createTrainer);
router.put('/trainers/:id', authorize('super_admin', 'college_admin'), updateTrainer);
router.delete('/trainers/:id', authorize('super_admin', 'college_admin'), deleteTrainer);

const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Exams (Shared with trainers)
router.get('/exams', authorize('super_admin', 'college_admin', 'trainer'), getExams);
router.get('/exams/:id', authorize('super_admin', 'college_admin', 'trainer'), getExamById);
router.post('/exams', authorize('super_admin', 'college_admin', 'trainer'), createExam);
router.put('/exams/:id', authorize('super_admin', 'college_admin', 'trainer'), updateExam);
router.post('/exams/:id/publish', authorize('super_admin', 'college_admin', 'trainer'), publishExam);
router.post('/exams/:id/unpublish', authorize('super_admin', 'college_admin', 'trainer'), unpublishExam);
router.post('/exams/:id/clone', authorize('super_admin', 'college_admin', 'trainer'), cloneExam);
router.post('/exams/parse-document', authorize('super_admin', 'college_admin', 'trainer'), upload.single('document'), parseDocument);
router.post('/exams/bulk-import', authorize('super_admin', 'college_admin', 'trainer'), upload.single('file'), bulkImportQuestions);
router.get('/allotments', authorize('super_admin', 'college_admin', 'trainer'), getAllotments);
router.delete('/exams/:id', authorize('super_admin', 'college_admin', 'trainer'), deleteExam);

// Template download (no auth required — it's just a static file pointer)
router.get('/exams/bulk-import/template', (req, res) => {
    const templatePath = path.join(__dirname, '..', 'bulk_import_template.xlsx');
    res.download(templatePath, 'bulk_import_template.xlsx', (err) => {
        if (err) res.status(404).json({ success: false, error: 'Template file not found' });
    });
});

// Certificate download (admin can pull cert for any student attempt)
const { generateCertificate } = require('../utils/certificateGenerator');
const StudentAttempt = require('../models/StudentAttempt');
const Exam = require('../models/Exam');
const Course = require('../models/Course');
const College = require('../models/College');

router.get('/certificate/:attemptId', async (req, res) => {
    try {
        const attempt = await StudentAttempt.findById(req.params.attemptId).populate('examId');
        if (!attempt) return res.status(404).json({ success: false, error: 'Attempt not found' });
        if (attempt.result !== 'pass') return res.status(400).json({ success: false, error: 'Certificate only available for passed students' });

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
            date: attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString('en-IN') : undefined
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

// Training Logs (Admin access)
router.get('/training-logs', authorize('super_admin', 'college_admin'), getAdminTrainingLogs);

module.exports = router;
