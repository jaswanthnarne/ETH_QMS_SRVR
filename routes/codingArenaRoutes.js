const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getArenaCatalog,
    listCompaniesAdmin,
    createCompany,
    updateCompany,
    deleteCompany,
    listQuestionsAdmin,
    createQuestion,
    updateQuestion,
    deleteQuestion
} = require('../controllers/codingArenaController');

// Student-facing catalog (solutions stripped)
router.get('/catalog', getArenaCatalog);

// Ops / Super admin management
const manage = [protect, authorize('super_admin', 'ops_admin', 'ast_ops_admin')];

router.get('/admin/companies', manage, listCompaniesAdmin);
router.post('/admin/companies', manage, createCompany);
router.put('/admin/companies/:id', manage, updateCompany);
router.delete('/admin/companies/:id', manage, deleteCompany);

router.get('/admin/companies/:companyId/questions', manage, listQuestionsAdmin);
router.post('/admin/companies/:companyId/questions', manage, createQuestion);
router.put('/admin/questions/:id', manage, updateQuestion);
router.delete('/admin/questions/:id', manage, deleteQuestion);

module.exports = router;
