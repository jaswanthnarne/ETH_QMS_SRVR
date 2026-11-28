const express = require('express');
const router = express.Router();
const {
    protectAnyCurriculumActor,
    requireCurriculumAdmin,
    getLanguageTracks,
    createLanguageTrack,
    updateLanguageTrack,
    deleteLanguageTrack,
    upsertChapter,
    deleteChapter,
    resetTrackToDefaults
} = require('../controllers/languageDescriptionController');

router.use(protectAnyCurriculumActor);

// Accessible to all Students, Trainers, Ops Admins & Admins
router.get('/', getLanguageTracks);

// Admin & Ops Admin Customization Routes
router.post('/tracks', requireCurriculumAdmin, createLanguageTrack);
router.put('/tracks/:slug', requireCurriculumAdmin, updateLanguageTrack);
router.delete('/tracks/:slug', requireCurriculumAdmin, deleteLanguageTrack);
router.post('/tracks/:slug/reset', requireCurriculumAdmin, resetTrackToDefaults);

router.post('/tracks/:slug/chapters', requireCurriculumAdmin, upsertChapter);
router.put('/tracks/:slug/chapters/:chapterNumber', requireCurriculumAdmin, upsertChapter);
router.delete('/tracks/:slug/chapters/:chapterNumber', requireCurriculumAdmin, deleteChapter);

module.exports = router;
