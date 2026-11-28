const path = require('path');
const { pathToFileURL } = require('url');
const CodingCompany = require('../models/CodingCompany');
const CodingQuestion = require('../models/CodingQuestion');

const CATEGORY_LABELS = {
    service: 'Service-Based',
    product: 'Product-Based',
    startup: 'Unicorn Startup',
    misc: 'FinTech & Specialized'
};

const slugify = (str = '') =>
    String(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const normalizeTestCases = (testCases) => {
    if (!Array.isArray(testCases)) return [];
    return testCases.map((tc) => ({
        args: Array.isArray(tc?.args) ? tc.args : [],
        expected: tc?.expected === undefined ? null : tc.expected,
        isHidden: Boolean(tc?.isHidden)
    }));
};

const sanitizeQuestionForStudent = (q) => {
    const obj = typeof q.toObject === 'function' ? q.toObject() : q;
    const { solution, createdBy, updatedBy, __v, ...rest } = obj;
    return { ...rest, id: obj.qid };
};

const shapeCompany = (c, totalQuestions = 0) => {
    const obj = typeof c.toObject === 'function' ? c.toObject() : c;
    return {
        ...obj,
        id: obj.slug,
        categoryLabel: obj.categoryLabel || CATEGORY_LABELS[obj.category] || '',
        totalQuestions
    };
};

/* ─────────────────────────── Seeding ─────────────────────────── */

let seedingPromise = null;

/**
 * One-time import of the built-in company catalog + 440 questions from the
 * client data modules into MongoDB, so Ops Admin can manage them via CRUD.
 */
const ensureSeeded = async () => {
    const count = await CodingCompany.estimatedDocumentCount();
    if (count > 0) return;
    if (seedingPromise) return seedingPromise;

    seedingPromise = (async () => {
        const dataDir = path.resolve(__dirname, '../../client/src/data');
        const { COMPANIES_CATALOG } = await import(pathToFileURL(path.join(dataDir, 'companyData.js')).href);
        const { ALL_COMPANY_QUESTIONS } = await import(
            pathToFileURL(path.join(dataDir, 'companyQuestions.js')).href
        );

        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const slugMap = {};

        for (let i = 0; i < COMPANIES_CATALOG.length; i++) {
            const c = COMPANIES_CATALOG[i];
            const doc = await CodingCompany.findOneAndUpdate(
                { slug: c.id },
                {
                    $setOnInsert: {
                        slug: c.id,
                        name: c.name,
                        fullName: c.fullName || '',
                        category: c.category,
                        categoryLabel: c.categoryLabel || CATEGORY_LABELS[c.category],
                        tagline: c.tagline || '',
                        packageRange: c.packageRange || '',
                        accentColor: c.accentColor || '#5899B5',
                        focusAreas: c.focusAreas || [],
                        description: c.description || '',
                        sortOrder: i
                    }
                },
                { upsert: true, new: true }
            );
            slugMap[norm(c.id)] = doc;
        }

        const ops = ALL_COMPANY_QUESTIONS.map((q) => {
            const company = slugMap[norm(q.company)];
            if (!company) return null;
            return {
                updateOne: {
                    filter: { qid: q.id },
                    update: {
                        $setOnInsert: {
                            qid: q.id,
                            companyId: company._id,
                            company: company.slug,
                            number: q.number || 1,
                            title: q.title,
                            difficulty: ['Easy', 'Medium', 'Hard'].includes(q.difficulty) ? q.difficulty : 'Medium',
                            topic: q.topic || '',
                            frequency: q.frequency || '',
                            context: q.context || '',
                            fnName: q.fnName || 'solve',
                            params: q.params || [],
                            returnType: q.returnType || '',
                            description: q.description || '',
                            constraints: q.constraints || [],
                            hint: q.hint || '',
                            starter: q.starter || {},
                            solution: q.solution || {},
                            testCases: normalizeTestCases(q.testCases)
                        }
                    },
                    upsert: true
                }
            };
        }).filter(Boolean);

        if (ops.length) await CodingQuestion.bulkWrite(ops, { ordered: false });
        console.log(`[CodingArena] Seeded ${COMPANIES_CATALOG.length} companies and ${ops.length} questions.`);
    })().catch((err) => {
        console.error('[CodingArena] Seeding failed:', err.message);
    }).finally(() => {
        seedingPromise = null;
    });

    return seedingPromise;
};

/* ─────────────────────────── Student / Public (read) ─────────────────────────── */

// GET /api/coding-arena/catalog  → active companies + all active questions (no solutions)
const getArenaCatalog = async (req, res) => {
    try {
        await ensureSeeded();
        const [companies, questions] = await Promise.all([
            CodingCompany.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
            CodingQuestion.find({ isActive: true }).select('-solution -createdBy -updatedBy').sort({ number: 1 }).lean()
        ]);

        const activeSlugs = new Set(companies.map((c) => c.slug));
        const visibleQuestions = questions.filter((q) => activeSlugs.has(q.company));
        const countBySlug = visibleQuestions.reduce((acc, q) => {
            acc[q.company] = (acc[q.company] || 0) + 1;
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                companies: companies.map((c) => shapeCompany(c, countBySlug[c.slug] || 0)),
                questions: visibleQuestions.map(sanitizeQuestionForStudent)
            }
        });
    } catch (err) {
        console.error('getArenaCatalog error:', err);
        res.status(500).json({ success: false, error: 'Failed to load coding arena catalog' });
    }
};

/* ─────────────────────────── Admin: Companies CRUD ─────────────────────────── */

const listCompaniesAdmin = async (req, res) => {
    try {
        await ensureSeeded();
        const companies = await CodingCompany.find().sort({ sortOrder: 1, name: 1 }).lean();
        const counts = await CodingQuestion.aggregate([
            { $group: { _id: '$companyId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
        ]);
        const countMap = counts.reduce((acc, c) => {
            acc[c._id.toString()] = c;
            return acc;
        }, {});
        res.json({
            success: true,
            data: companies.map((c) => ({
                ...shapeCompany(c, countMap[c._id.toString()]?.total || 0),
                activeQuestions: countMap[c._id.toString()]?.active || 0
            }))
        });
    } catch (err) {
        console.error('listCompaniesAdmin error:', err);
        res.status(500).json({ success: false, error: 'Failed to load companies' });
    }
};

const pickCompanyFields = (body = {}) => {
    const out = {};
    ['name', 'fullName', 'category', 'tagline', 'packageRange', 'accentColor', 'logoUrl', 'website', 'description'].forEach(
        (k) => {
            if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
        }
    );
    if (body.focusAreas !== undefined) {
        out.focusAreas = Array.isArray(body.focusAreas)
            ? body.focusAreas.map((s) => String(s).trim()).filter(Boolean)
            : String(body.focusAreas)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
    }
    if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) out.sortOrder = Number(body.sortOrder) || 0;
    if (out.category) out.categoryLabel = body.categoryLabel?.trim() || CATEGORY_LABELS[out.category] || '';
    if (out.logoUrl && out.logoUrl.length > 3 * 1024 * 1024) {
        throw new Error('Logo image is too large (max ~2MB).');
    }
    return out;
};

const createCompany = async (req, res) => {
    try {
        const fields = pickCompanyFields(req.body);
        if (!fields.name) return res.status(400).json({ success: false, error: 'Company name is required' });

        let slug = slugify(req.body.slug || fields.name);
        if (!slug) return res.status(400).json({ success: false, error: 'Invalid company name' });
        if (await CodingCompany.exists({ slug })) {
            return res.status(400).json({ success: false, error: `A company with id "${slug}" already exists` });
        }
        const maxOrder = await CodingCompany.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();

        const company = await CodingCompany.create({
            sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
            ...fields,
            slug,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });
        res.status(201).json({ success: true, data: shapeCompany(company, 0) });
    } catch (err) {
        console.error('createCompany error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to create company' });
    }
};

const updateCompany = async (req, res) => {
    try {
        const fields = pickCompanyFields(req.body);
        const company = await CodingCompany.findByIdAndUpdate(
            req.params.id,
            { ...fields, updatedBy: req.user._id },
            { new: true, runValidators: true }
        );
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        const total = await CodingQuestion.countDocuments({ companyId: company._id });
        res.json({ success: true, data: shapeCompany(company, total) });
    } catch (err) {
        console.error('updateCompany error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to update company' });
    }
};

const deleteCompany = async (req, res) => {
    try {
        const company = await CodingCompany.findById(req.params.id);
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        const { deletedCount } = await CodingQuestion.deleteMany({ companyId: company._id });
        await company.deleteOne();
        res.json({ success: true, message: `Deleted ${company.name} and ${deletedCount} question(s)` });
    } catch (err) {
        console.error('deleteCompany error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete company' });
    }
};

/* ─────────────────────────── Admin: Questions CRUD ─────────────────────────── */

const listQuestionsAdmin = async (req, res) => {
    try {
        const company = await CodingCompany.findById(req.params.companyId).lean();
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        const questions = await CodingQuestion.find({ companyId: company._id }).sort({ number: 1 }).lean();
        res.json({ success: true, data: questions.map((q) => ({ ...q, id: q.qid })) });
    } catch (err) {
        console.error('listQuestionsAdmin error:', err);
        res.status(500).json({ success: false, error: 'Failed to load questions' });
    }
};

const pickQuestionFields = (body = {}) => {
    const out = {};
    ['title', 'difficulty', 'topic', 'frequency', 'context', 'fnName', 'returnType', 'description', 'hint'].forEach((k) => {
        if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
    });
    if (body.number !== undefined) out.number = Number(body.number) || 1;
    if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
    if (body.params !== undefined) {
        out.params = (Array.isArray(body.params) ? body.params : [])
            .filter((p) => p && String(p.name || '').trim())
            .map((p) => ({ name: String(p.name).trim(), type: String(p.type || 'int').trim() }));
    }
    if (body.constraints !== undefined) {
        out.constraints = (Array.isArray(body.constraints) ? body.constraints : String(body.constraints).split('\n'))
            .map((s) => String(s).trim())
            .filter(Boolean);
    }
    if (body.starter !== undefined) {
        out.starter = { python: body.starter?.python || '', javascript: body.starter?.javascript || '' };
    }
    if (body.solution !== undefined) {
        out.solution = { python: body.solution?.python || '', javascript: body.solution?.javascript || '' };
    }
    if (body.testCases !== undefined) out.testCases = normalizeTestCases(body.testCases);
    return out;
};

const createQuestion = async (req, res) => {
    try {
        const company = await CodingCompany.findById(req.params.companyId);
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

        const fields = pickQuestionFields(req.body);
        if (!fields.title) return res.status(400).json({ success: false, error: 'Title is required' });
        if (!fields.description) return res.status(400).json({ success: false, error: 'Description is required' });
        if (!fields.testCases || fields.testCases.length === 0) {
            return res.status(400).json({ success: false, error: 'Add at least one test case' });
        }

        const last = await CodingQuestion.findOne({ companyId: company._id }).sort({ number: -1 }).select('number').lean();
        const number = fields.number || (last?.number || 0) + 1;

        let qid = `${company.slug}-${number}`;
        let suffix = 1;
        while (await CodingQuestion.exists({ qid })) {
            qid = `${company.slug}-${number}-${suffix++}`;
        }

        const question = await CodingQuestion.create({
            ...fields,
            number,
            qid,
            companyId: company._id,
            company: company.slug,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });
        res.status(201).json({ success: true, data: { ...question.toObject(), id: question.qid } });
    } catch (err) {
        console.error('createQuestion error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to create question' });
    }
};

const updateQuestion = async (req, res) => {
    try {
        const fields = pickQuestionFields(req.body);
        if (fields.testCases && fields.testCases.length === 0) {
            return res.status(400).json({ success: false, error: 'A question needs at least one test case' });
        }
        const question = await CodingQuestion.findByIdAndUpdate(
            req.params.id,
            { ...fields, updatedBy: req.user._id },
            { new: true, runValidators: true }
        );
        if (!question) return res.status(404).json({ success: false, error: 'Question not found' });
        res.json({ success: true, data: { ...question.toObject(), id: question.qid } });
    } catch (err) {
        console.error('updateQuestion error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to update question' });
    }
};

const deleteQuestion = async (req, res) => {
    try {
        const question = await CodingQuestion.findByIdAndDelete(req.params.id);
        if (!question) return res.status(404).json({ success: false, error: 'Question not found' });
        res.json({ success: true, message: `Deleted "${question.title}"` });
    } catch (err) {
        console.error('deleteQuestion error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete question' });
    }
};

module.exports = {
    getArenaCatalog,
    listCompaniesAdmin,
    createCompany,
    updateCompany,
    deleteCompany,
    listQuestionsAdmin,
    createQuestion,
    updateQuestion,
    deleteQuestion
};
