const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 5 * 1024 * 1024 } 
});
const { protectStudent } = require('../middleware/authMiddleware');
const {
    loginStudent,
    setupStudentPassword,
    changeStudentPassword,
    updateStudentProfile,
    uploadStudentResume,
    getStudentMe,
    getStudentAttempts,
    getStudentActiveExams,
    getStudentTodos,
    createStudentTodo,
    updateStudentTodo,
    deleteStudentTodoPermanently
} = require('../controllers/studentAuthController');

router.post('/login', loginStudent);
router.post('/setup-password', setupStudentPassword);

// Protected routes
router.use(protectStudent);
router.get('/me', getStudentMe);
router.put('/change-password', changeStudentPassword);
router.put('/profile', updateStudentProfile);
router.post('/resume', upload.single('resume'), uploadStudentResume);
router.get('/attempts', getStudentAttempts);
router.get('/active-exams', getStudentActiveExams);

// Todo routes
router.get('/todos', getStudentTodos);
router.post('/todos', createStudentTodo);
router.put('/todos/:id', updateStudentTodo);
router.delete('/todos/:id', deleteStudentTodoPermanently);

module.exports = router;
