const express = require('express');
const path = require('path');
const router = express.Router();
const { 
    getColleges, getCollegeById, createCollege, updateCollege, deleteCollege, uploadCollegeLogo,
    getCourses, createCourse, updateCourse, deleteCourse, uploadCourseSyllabus, downloadCourseSyllabus,
    getTrainers, createTrainer, updateTrainer, deleteTrainer, uploadTrainerPdf, downloadTrainerPdf,
    createExam, getExams, getExamById, updateExam, publishExam, unpublishExam, parseDocument, getAllotments, deleteExam,
    getDashboardStats, bulkImportQuestions, cloneExam, getAdminTrainingLogs,
    getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser
} = require('../controllers/adminController');
const { getBatches, getBatchById, createBatchAdmin, getBatchesByCourse, updateBatch, deleteBatch } = require('../controllers/batchController');
const {
    getMappedCourses, mapCourseToCollege, removeCourseMapping,
    getMappedTrainers, mapTrainerToCourse, removeTrainerMapping
} = require('../controllers/collegeCourseController');
const {
    getStudentsByBatch, getStudentsByCollege, createStudent, importStudents, downloadTemplate, updateStudent, deleteStudent,
    parseStudentsExcel, importStudentsList
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Public download route for trainer details PDF (opened in new tab)
router.get('/trainers/:id/pdf', downloadTrainerPdf);
router.get('/courses/:id/syllabus', downloadCourseSyllabus);

// All routes require protection
router.use(protect);

const ALL_ADMINS = ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin'];

router.get('/dashboard-stats', authorize(...ALL_ADMINS), getDashboardStats);

// Colleges (Admin & Trainers)
router.get('/colleges', authorize(...ALL_ADMINS, 'trainer'), getColleges);
router.get('/colleges/:id', authorize(...ALL_ADMINS, 'trainer'), getCollegeById);
router.post('/colleges', authorize('super_admin', 'ops_admin'), createCollege);
router.put('/colleges/:id', authorize(...ALL_ADMINS), updateCollege);
router.post('/colleges/:id/logo', authorize(...ALL_ADMINS), upload.single('logo'), uploadCollegeLogo);
router.delete('/colleges/:id', authorize('super_admin', 'ops_admin'), deleteCollege);

// Courses
router.get('/courses', authorize(...ALL_ADMINS, 'trainer'), getCourses); 
router.post('/courses', authorize(...ALL_ADMINS, 'trainer'), createCourse);
router.get('/colleges/:collegeId/courses', authorize(...ALL_ADMINS, 'trainer'), getCourses);
router.post('/colleges/:collegeId/courses', authorize(...ALL_ADMINS, 'trainer'), createCourse);
router.put('/courses/:id', authorize(...ALL_ADMINS, 'trainer'), updateCourse);
router.delete('/courses/:id', authorize('super_admin', 'ops_admin'), deleteCourse);
router.post('/courses/:id/syllabus', authorize(...ALL_ADMINS, 'trainer'), upload.single('pdf'), uploadCourseSyllabus);

// Batches (legacy — college-scoped)
router.get('/colleges/:collegeId/batches', authorize(...ALL_ADMINS, 'trainer'), getBatches);

// ==========================================
// ERP ROUTES — College-Course Mapping
// ==========================================
router.get('/colleges/:collegeId/mapped-courses', authorize(...ALL_ADMINS), getMappedCourses);
router.post('/colleges/:collegeId/mapped-courses', authorize('super_admin', 'ops_admin', 'ast_ops_admin'), mapCourseToCollege);
router.delete('/colleges/:collegeId/mapped-courses/:mapId', authorize('super_admin', 'ops_admin', 'ast_ops_admin'), removeCourseMapping);

// ERP ROUTES — Trainer-Course Mapping (at College Level)
router.get('/colleges/:collegeId/courses/:courseId/trainers', authorize(...ALL_ADMINS), getMappedTrainers);
router.post('/colleges/:collegeId/courses/:courseId/trainers', authorize('super_admin', 'ops_admin', 'ast_ops_admin'), mapTrainerToCourse);
router.delete('/colleges/:collegeId/courses/:courseId/trainers/:mapId', authorize('super_admin', 'ops_admin', 'ast_ops_admin'), removeTrainerMapping);

// ERP ROUTES — Batches (College-Course scoped)
router.get('/batches/:id', authorize(...ALL_ADMINS, 'trainer'), getBatchById);
router.get('/colleges/:collegeId/courses/:courseId/batches', authorize(...ALL_ADMINS), getBatchesByCourse);
router.post('/colleges/:collegeId/courses/:courseId/batches', authorize(...ALL_ADMINS), createBatchAdmin);
router.post('/colleges/:collegeId/batches', authorize(...ALL_ADMINS), createBatchAdmin);
router.put('/batches/:id', authorize(...ALL_ADMINS), updateBatch);
router.delete('/batches/:id', authorize('super_admin', 'ops_admin'), deleteBatch);

// ERP ROUTES — Students (Batch scoped)
router.get('/batches/:batchId/students', authorize(...ALL_ADMINS, 'trainer'), getStudentsByBatch);
router.post('/batches/:batchId/students', authorize(...ALL_ADMINS, 'trainer'), createStudent);
router.post('/batches/:batchId/students/parse', authorize(...ALL_ADMINS), upload.single('file'), parseStudentsExcel);
router.post('/batches/:batchId/students/import-list', authorize(...ALL_ADMINS), importStudentsList);
router.post('/batches/:batchId/students/import', authorize(...ALL_ADMINS), upload.single('file'), importStudents);
router.get('/batches/:batchId/students/template', authorize(...ALL_ADMINS), downloadTemplate);
router.put('/batches/:batchId/students/:studentId', authorize(...ALL_ADMINS, 'trainer'), updateStudent);
router.delete('/batches/:batchId/students/:studentId', authorize('super_admin', 'ops_admin'), deleteStudent);
router.get('/colleges/:collegeId/students', authorize(...ALL_ADMINS), getStudentsByCollege);

// Trainers (Admin only)
router.get('/trainers', authorize(...ALL_ADMINS), getTrainers);
router.post('/trainers', authorize(...ALL_ADMINS), createTrainer);
router.put('/trainers/:id', authorize(...ALL_ADMINS), updateTrainer);
router.post('/trainers/:id/pdf', authorize(...ALL_ADMINS), upload.single('pdf'), uploadTrainerPdf);
router.delete('/trainers/:id', authorize('super_admin', 'ops_admin'), deleteTrainer);

// Exams (Shared with trainers)
router.get('/exams', authorize(...ALL_ADMINS, 'trainer'), getExams);
router.get('/exams/:id', authorize(...ALL_ADMINS, 'trainer'), getExamById);
router.post('/exams', authorize(...ALL_ADMINS, 'trainer'), createExam);
router.put('/exams/:id', authorize(...ALL_ADMINS, 'trainer'), updateExam);
router.post('/exams/:id/publish', authorize(...ALL_ADMINS, 'trainer'), publishExam);
router.post('/exams/:id/unpublish', authorize(...ALL_ADMINS, 'trainer'), unpublishExam);
router.post('/exams/:id/clone', authorize(...ALL_ADMINS, 'trainer'), cloneExam);
router.post('/exams/parse-document', authorize(...ALL_ADMINS, 'trainer'), upload.single('document'), parseDocument);
router.post('/exams/bulk-import', authorize(...ALL_ADMINS, 'trainer'), upload.single('file'), bulkImportQuestions);
router.get('/allotments', authorize(...ALL_ADMINS, 'trainer'), getAllotments);
router.delete('/exams/:id', authorize('super_admin', 'ops_admin'), deleteExam);

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
router.get('/training-logs', authorize(...ALL_ADMINS), getAdminTrainingLogs);

// User Accounts Management (Super Admin & Ops Admin only)
router.get('/users', authorize('super_admin', 'ops_admin'), getAdminUsers);
router.post('/users', authorize('super_admin', 'ops_admin'), createAdminUser);
router.put('/users/:id', authorize('super_admin', 'ops_admin'), updateAdminUser);
router.delete('/users/:id', authorize('super_admin', 'ops_admin'), deleteAdminUser);

module.exports = router;
