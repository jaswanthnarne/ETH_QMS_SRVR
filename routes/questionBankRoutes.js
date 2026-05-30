const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    importToExam,
    getBankStats
} = require('../controllers/questionBankController');

router.use(protect);
router.use(authorize('super_admin', 'college_admin'));

router.get('/', getQuestions);
router.get('/stats', getBankStats);
router.post('/', createQuestion);
router.put('/:id', updateQuestion);
router.delete('/:id', deleteQuestion);
router.post('/import-to-exam', importToExam);

module.exports = router;
