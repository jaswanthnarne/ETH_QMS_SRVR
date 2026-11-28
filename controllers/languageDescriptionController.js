const path = require('path');
const { pathToFileURL } = require('url');
const jwt = require('jsonwebtoken');
const LanguageTrack = require('../models/LanguageTrack');
const User = require('../models/User');
const Student = require('../models/Student');

const CUSTOMIZER_ROLES = ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin'];

const slugify = (str = '') =>
    String(str)
        .toLowerCase()
        .trim()
        .replace(/\+\+/g, 'pp')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/**
 * Authenticates any logged-in Student, Trainer, or Admin/Ops Admin.
 */
const protectAnyCurriculumActor = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Not authorized, no token' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password').lean();
        if (user) {
            if (user.activeSessionId && decoded.sessionId !== user.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            req.actor = {
                id: user._id,
                role: user.role,
                canCustomize: CUSTOMIZER_ROLES.includes(user.role),
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
            };
            return next();
        }

        const student = await Student.findById(decoded.id).select('-password').lean();
        if (student) {
            if (student.activeSessionId && decoded.sessionId !== student.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            req.actor = {
                id: student._id,
                role: 'student',
                canCustomize: false,
                name: student.name,
                usn: student.usn
            };
            return next();
        }

        return res.status(401).json({ success: false, error: 'Account not found' });
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
};

const requireCurriculumAdmin = (req, res, next) => {
    if (!req.actor || !req.actor.canCustomize) {
        return res.status(403).json({
            success: false,
            error: 'Only Admin and Ops Admin accounts can customize language descriptions and chapters.'
        });
    }
    return next();
};

/* ─────────────────────────── Seeding 8 Languages x 10 Chapters ─────────────────────────── */

let seedPromise = null;

const ensureLanguageTracksSeeded = async () => {
    const count = await LanguageTrack.estimatedDocumentCount();
    if (count >= 8) return;
    if (seedPromise) return seedPromise;

    seedPromise = (async () => {
        const dataDir = path.resolve(__dirname, '../../client/src/data');
        const { ALL_LANGUAGE_TRACKS } = await import(
            pathToFileURL(path.join(dataDir, 'languageCurriculumData.js')).href
        );

        for (let i = 0; i < ALL_LANGUAGE_TRACKS.length; i++) {
            const track = ALL_LANGUAGE_TRACKS[i];
            await LanguageTrack.findOneAndUpdate(
                { slug: track.slug },
                {
                    $setOnInsert: {
                        slug: track.slug,
                        name: track.name,
                        fullName: track.fullName || track.name,
                        badge: track.badge || track.name.slice(0, 3).toUpperCase(),
                        tagline: track.tagline || '',
                        description: track.description || '',
                        accentColor: track.accentColor || '#004AAD',
                        secondaryColor: track.secondaryColor || '#E0F2FE',
                        fileExtension: track.fileExtension || '.txt',
                        paradigm: track.paradigm || 'Multi-Paradigm',
                        creatorInfo: track.creatorInfo || '',
                        logoUrl: track.logoUrl || '',
                        sortOrder: track.sortOrder || i + 1,
                        isActive: true,
                        chapters: track.chapters || []
                    }
                },
                { upsert: true, new: true }
            );
        }
        console.log(`[LanguageDescription] Verified ${ALL_LANGUAGE_TRACKS.length} languages (80 chapters).`);
    })()
        .catch((err) => {
            console.error('[LanguageDescription] Seeding error:', err.message);
        })
        .finally(() => {
            seedPromise = null;
        });

    return seedPromise;
};

/* ─────────────────────────── GET /api/language-description ─────────────────────────── */

const getLanguageTracks = async (req, res) => {
    try {
        await ensureLanguageTracksSeeded();
        const tracks = await LanguageTrack.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();

        tracks.forEach((t) => {
            if (Array.isArray(t.chapters)) {
                t.chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
            }
        });

        res.json({
            success: true,
            canCustomize: Boolean(req.actor?.canCustomize),
            data: tracks
        });
    } catch (err) {
        console.error('getLanguageTracks error:', err);
        res.status(500).json({ success: false, error: 'Failed to load language curriculum' });
    }
};

/* ─────────────────────────── Admin / Ops Admin: Track CRUD ─────────────────────────── */

const createLanguageTrack = async (req, res) => {
    try {
        const {
            name,
            slug: rawSlug,
            fullName,
            badge,
            tagline,
            description,
            accentColor,
            secondaryColor,
            fileExtension,
            paradigm,
            creatorInfo,
            logoUrl
        } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'Language name is required' });
        }

        const slug = slugify(rawSlug || name);
        if (!slug) {
            return res.status(400).json({ success: false, error: 'Invalid language slug' });
        }

        const existing = await LanguageTrack.findOne({ slug });
        if (existing) {
            return res.status(400).json({ success: false, error: `A language track with slug "${slug}" already exists` });
        }

        const maxTrack = await LanguageTrack.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();

        const track = await LanguageTrack.create({
            slug,
            name: String(name).trim(),
            fullName: String(fullName || name).trim(),
            badge: String(badge || String(name).slice(0, 3).toUpperCase()).trim(),
            tagline: String(tagline || '').trim(),
            description: String(description || '').trim(),
            accentColor: String(accentColor || '#004AAD').trim(),
            secondaryColor: String(secondaryColor || '#E0F2FE').trim(),
            fileExtension: String(fileExtension || '.txt').trim(),
            paradigm: String(paradigm || 'Multi-Paradigm').trim(),
            creatorInfo: String(creatorInfo || '').trim(),
            logoUrl: String(logoUrl || '').trim(),
            sortOrder: (maxTrack?.sortOrder || 0) + 1,
            chapters: [],
            updatedBy: req.actor.id
        });

        res.status(201).json({ success: true, data: track });
    } catch (err) {
        console.error('createLanguageTrack error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to create language track' });
    }
};

const updateLanguageTrack = async (req, res) => {
    try {
        const track = await LanguageTrack.findOne({ slug: req.params.slug });
        if (!track) {
            return res.status(404).json({ success: false, error: 'Language track not found' });
        }

        const fields = [
            'name',
            'fullName',
            'badge',
            'tagline',
            'description',
            'accentColor',
            'secondaryColor',
            'fileExtension',
            'paradigm',
            'creatorInfo',
            'logoUrl'
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) {
                track[f] = String(req.body[f]).trim();
            }
        });
        if (req.body.sortOrder !== undefined) {
            track.sortOrder = Number(req.body.sortOrder) || track.sortOrder;
        }
        track.updatedBy = req.actor.id;
        await track.save();

        res.json({ success: true, data: track });
    } catch (err) {
        console.error('updateLanguageTrack error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to update language track' });
    }
};

const deleteLanguageTrack = async (req, res) => {
    try {
        const track = await LanguageTrack.findOneAndDelete({ slug: req.params.slug });
        if (!track) {
            return res.status(404).json({ success: false, error: 'Language track not found' });
        }
        res.json({ success: true, message: `Deleted language track "${track.name}"` });
    } catch (err) {
        console.error('deleteLanguageTrack error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete language track' });
    }
};

/* ─────────────────────────── Admin / Ops Admin: Chapter CRUD ─────────────────────────── */

const normalizeChapterPayload = (body = {}, fallbackNumber = 1) => {
    const parseLines = (val) =>
        Array.isArray(val)
            ? val.map((s) => String(s).trim()).filter(Boolean)
            : String(val || '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);

    const syntaxTable = Array.isArray(body.syntaxTable)
        ? body.syntaxTable
              .filter((r) => r && String(r.construct || '').trim() && String(r.syntax || '').trim())
              .map((r) => ({
                  construct: String(r.construct).trim(),
                  syntax: String(r.syntax).trim(),
                  description: String(r.description || '').trim()
              }))
        : [];

    const graphData = Array.isArray(body.graphData)
        ? body.graphData
              .filter((g) => g && String(g.label || '').trim())
              .map((g) => ({
                  label: String(g.label).trim(),
                  value: Math.max(1, Math.min(100, Number(g.value) || 50)),
                  displayValue: String(g.displayValue || `${g.value || 50}`).trim(),
                  note: String(g.note || '').trim()
              }))
        : [];

    const images = Array.isArray(body.images)
        ? body.images
              .filter((img) => img && String(img.url || img).trim())
              .map((img) =>
                  typeof img === 'string'
                      ? { url: img.trim(), caption: '' }
                      : { url: String(img.url).trim(), caption: String(img.caption || '').trim() }
              )
        : [];

    const examples = Array.isArray(body.examples)
        ? body.examples
              .filter((ex) => ex && String(ex.code || '').trim())
              .map((ex, idx) => ({
                  title: String(ex.title || `Example ${idx + 1}`).trim(),
                  code: String(ex.code),
                  output: String(ex.output || '').trim(),
                  explanation: String(ex.explanation || '').trim()
              }))
        : [];

    const problems = Array.isArray(body.problems)
        ? body.problems
              .filter((p) => p && String(p.title || '').trim() && String(p.statement || '').trim())
              .map((p) => ({
                  title: String(p.title).trim(),
                  difficulty: ['Easy', 'Medium', 'Hard'].includes(p.difficulty) ? p.difficulty : 'Easy',
                  statement: String(p.statement).trim(),
                  sampleInput: String(p.sampleInput || '').trim(),
                  sampleOutput: String(p.sampleOutput || '').trim(),
                  constraints: String(p.constraints || '').trim(),
                  hint: String(p.hint || '').trim(),
                  starterCode: String(p.starterCode || '')
              }))
        : [];

    return {
        chapterNumber: Number(body.chapterNumber) || fallbackNumber,
        title: String(body.title || `Chapter ${fallbackNumber}`).trim(),
        duration: String(body.duration || '15 min read').trim(),
        difficulty: ['Beginner', 'Intermediate', 'Advanced'].includes(body.difficulty)
            ? body.difficulty
            : 'Beginner',
        summary: String(body.summary || '').trim(),
        overview: String(body.overview || '').trim(),
        keyPoints: parseLines(body.keyPoints),
        syntaxSummaryCode: String(body.syntaxSummaryCode || ''),
        syntaxTable,
        diagramTitle: String(body.diagramTitle || 'Execution & Architecture Flow').trim(),
        diagramSteps: parseLines(body.diagramSteps),
        graphTitle: String(body.graphTitle || 'Performance & Complexity Benchmark').trim(),
        graphMetricLabel: String(body.graphMetricLabel || 'Relative Efficiency Metric').trim(),
        graphData,
        images,
        examples,
        problems,
        subTopics: Array.isArray(body.subTopics) ? body.subTopics : undefined
    };
};

const upsertChapter = async (req, res) => {
    try {
        const track = await LanguageTrack.findOne({ slug: req.params.slug });
        if (!track) {
            return res.status(404).json({ success: false, error: 'Language track not found' });
        }

        const targetNum = Number(req.params.chapterNumber || req.body.chapterNumber) || track.chapters.length + 1;
        const normalized = normalizeChapterPayload(req.body, targetNum);

        if (!normalized.title) {
            return res.status(400).json({ success: false, error: 'Chapter title is required' });
        }
        if (!normalized.overview) {
            return res.status(400).json({ success: false, error: 'Chapter reading content / overview is required' });
        }

        const existingIndex = track.chapters.findIndex(
            (c) => Number(c.chapterNumber) === Number(targetNum)
        );

        if (existingIndex >= 0) {
            track.chapters[existingIndex] = {
                ...track.chapters[existingIndex].toObject(),
                ...normalized,
                chapterNumber: targetNum
            };
        } else {
            track.chapters.push({
                ...normalized,
                chapterNumber: targetNum
            });
        }

        track.chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
        track.updatedBy = req.actor.id;
        await track.save();

        res.json({
            success: true,
            data: track
        });
    } catch (err) {
        console.error('upsertChapter error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to save chapter' });
    }
};

const deleteChapter = async (req, res) => {
    try {
        const track = await LanguageTrack.findOne({ slug: req.params.slug });
        if (!track) {
            return res.status(404).json({ success: false, error: 'Language track not found' });
        }

        const targetNum = Number(req.params.chapterNumber);
        track.chapters = track.chapters.filter((c) => Number(c.chapterNumber) !== targetNum);
        // Re-number sequential chapters cleanly
        track.chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
        track.chapters.forEach((ch, idx) => {
            ch.chapterNumber = idx + 1;
        });

        track.updatedBy = req.actor.id;
        await track.save();

        res.json({
            success: true,
            data: track
        });
    } catch (err) {
        console.error('deleteChapter error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete chapter' });
    }
};

const resetTrackToDefaults = async (req, res) => {
    try {
        const dataDir = path.resolve(__dirname, '../../client/src/data');
        const { ALL_LANGUAGE_TRACKS } = await import(
            pathToFileURL(path.join(dataDir, 'languageCurriculumData.js')).href
        );
        const defaultTrack = ALL_LANGUAGE_TRACKS.find((t) => t.slug === req.params.slug);
        if (!defaultTrack) {
            return res.status(404).json({ success: false, error: 'No built-in default found for this track' });
        }

        const updated = await LanguageTrack.findOneAndUpdate(
            { slug: req.params.slug },
            {
                $set: {
                    name: defaultTrack.name,
                    fullName: defaultTrack.fullName,
                    badge: defaultTrack.badge,
                    tagline: defaultTrack.tagline,
                    description: defaultTrack.description,
                    accentColor: defaultTrack.accentColor,
                    secondaryColor: defaultTrack.secondaryColor,
                    fileExtension: defaultTrack.fileExtension,
                    paradigm: defaultTrack.paradigm,
                    creatorInfo: defaultTrack.creatorInfo,
                    chapters: defaultTrack.chapters,
                    updatedBy: req.actor.id
                }
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('resetTrackToDefaults error:', err);
        res.status(500).json({ success: false, error: 'Failed to reset track to defaults' });
    }
};

module.exports = {
    protectAnyCurriculumActor,
    requireCurriculumAdmin,
    ensureLanguageTracksSeeded,
    getLanguageTracks,
    createLanguageTrack,
    updateLanguageTrack,
    deleteLanguageTrack,
    upsertChapter,
    deleteChapter,
    resetTrackToDefaults
};
