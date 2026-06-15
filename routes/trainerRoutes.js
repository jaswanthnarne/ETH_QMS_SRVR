const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');

const { 
    getAssignedExams, 
    getTrainerStats, 
    getWaitingRoom,
    getTrainerExams,
    startSession,
    forceSubmitSession,
    publishTrainerExam,
    pauseSession,
    resumeSession,
    restartSession,
    getTrainerCollegesAndCourses
} = require('../controllers/trainerController');

const {
    createLog,
    getLogs,
    updateLog,
    deleteLog
} = require('../controllers/trainingLogController');

router.use(protect);
router.use(authorize('trainer'));

router.get('/exams', getAssignedExams);
router.get('/course-exams', getTrainerExams);
router.get('/my-colleges-courses', getTrainerCollegesAndCourses);
router.get('/stats', getTrainerStats);
router.get('/waiting-room/:key', getWaitingRoom);
router.post('/waiting-room/:key/start', startSession);
router.post('/waiting-room/:key/force-submit', forceSubmitSession);
router.post('/waiting-room/:key/pause', pauseSession);
router.post('/waiting-room/:key/resume', resumeSession);
router.post('/waiting-room/:key/restart', restartSession);
router.post('/exams/:id/publish', publishTrainerExam);

// Daily Training Logs CRUD Routes
router.post('/logs', createLog);
router.get('/logs', getLogs);
router.put('/logs/:id', updateLog);
router.delete('/logs/:id', deleteLog);

// Trainer Batches CRUD Routes
const { getBatches } = require('../controllers/batchController');
router.get('/batches', getBatches);

module.exports = router;
