const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const { logAudit } = require('../utils/auditHelper');

// GET /api/question-bank?collegeId=&subject=&topic=&difficulty=&bloomsLevel=&page=1&limit=20
exports.getQuestions = async (req, res) => {
    try {
        const { collegeId, courseId, subject, topic, difficulty, bloomsLevel, search, page = 1, limit = 20 } = req.query;
        
        let filter = {};
        
        // College scoping
        if (req.user.role === 'college_admin') {
            filter.collegeId = req.user.collegeId;
        } else if (collegeId) {
            filter.collegeId = collegeId;
        }

        // Course filter
        if (courseId) filter.courseId = courseId;

        if (subject) filter.subject = { $regex: subject, $options: 'i' };
        if (topic) filter.topic = { $regex: topic, $options: 'i' };
        if (difficulty) filter.difficulty = difficulty;
        if (bloomsLevel) filter.bloomsLevel = bloomsLevel;
        if (search) filter.text = { $regex: search, $options: 'i' };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [questions, totalCount] = await Promise.all([
            QuestionBank.find(filter)
                .populate('collegeId', 'name')
                .populate('courseId', 'name code')
                .populate('createdBy', 'firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            QuestionBank.countDocuments(filter)
        ]);

        // Get distinct subjects and topics for filter dropdowns
        const filterCollegeId = filter.collegeId || null;
        const subjectFilter = filterCollegeId ? { collegeId: filterCollegeId } : {};
        const [subjects, topics] = await Promise.all([
            QuestionBank.distinct('subject', subjectFilter),
            QuestionBank.distinct('topic', subjectFilter)
        ]);

        res.json({
            success: true,
            count: questions.length,
            totalCount,
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            currentPage: parseInt(page),
            data: questions,
            filters: { subjects: subjects.filter(Boolean), topics: topics.filter(Boolean) }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/question-bank
exports.createQuestion = async (req, res) => {
    try {
        const { subject, topic, difficulty, bloomsLevel, type, text, points, options, correctAnswer, correctAnswers, tags, imageUrl, courseId } = req.body;
        
        const collegeId = req.body.collegeId || req.user.collegeId;
        if (!collegeId) return res.status(400).json({ success: false, error: 'collegeId is required' });
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId is required' });

        // Build choices depending on type
        let choices = [];
        let correctAnswerText = null;

        if (type === 'single_correct' || type === 'mcq') {
            choices = (options || []).map((opt, i) => ({
                id: `opt_${i}`, text: opt,
                isCorrect: opt === correctAnswer
            }));
        } else if (type === 'multiple_correct' || type === 'multiple') {
            const correctArr = Array.isArray(correctAnswers) ? correctAnswers : [];
            choices = (options || []).map((opt, i) => ({
                id: `opt_${i}`, text: opt,
                isCorrect: correctArr.includes(opt)
            }));
        } else if (type === 'true_false') {
            choices = ['True', 'False'].map((opt, i) => ({
                id: `opt_${i}`, text: opt,
                isCorrect: opt === correctAnswer
            }));
        } else if (type === 'fill_blank' || type === 'fill_blanks' || type === 'numeric') {
            correctAnswerText = correctAnswer?.toString() || '';
        }

        const question = await QuestionBank.create({
            collegeId,
            courseId,
            subject,
            topic: topic || '',
            difficulty: difficulty || 'medium',
            bloomsLevel: bloomsLevel || 'remember',
            type,
            text,
            points: points || 1,
            correctAnswerText,
            options: { choices },
            tags: tags || [],
            imageUrl: imageUrl || undefined,
            createdBy: req.user._id
        });

        await logAudit(req, 'CREATE_BANK_QUESTION', 'QuestionBank', question._id, text.substring(0, 50));
        res.status(201).json({ success: true, data: question });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// PUT /api/question-bank/:id
exports.updateQuestion = async (req, res) => {
    try {
        const question = await QuestionBank.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!question) return res.status(404).json({ success: false, error: 'Question not found' });

        res.json({ success: true, data: question });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// DELETE /api/question-bank/:id
exports.deleteQuestion = async (req, res) => {
    try {
        const question = await QuestionBank.findById(req.params.id);
        if (!question) return res.status(404).json({ success: false, error: 'Question not found' });

        await logAudit(req, 'DELETE_BANK_QUESTION', 'QuestionBank', question._id, question.text.substring(0, 50));
        await question.deleteOne();
        res.json({ success: true, message: 'Question deleted from bank' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/question-bank/import-to-exam
// Copy selected bank questions into a specific exam
exports.importToExam = async (req, res) => {
    try {
        const { examId, questionIds } = req.body;
        if (!examId || !questionIds?.length) {
            return res.status(400).json({ success: false, error: 'examId and questionIds are required' });
        }

        const bankQuestions = await QuestionBank.find({ _id: { $in: questionIds } });
        if (bankQuestions.length === 0) {
            return res.status(404).json({ success: false, error: 'No matching questions found in bank' });
        }

        // Get current max order for this exam
        const lastQuestion = await Question.findOne({ examId }).sort({ order: -1 });
        let startOrder = lastQuestion ? lastQuestion.order + 1 : 0;

        const examQuestions = bankQuestions.map((bq, idx) => ({
            examId,
            type: bq.type,
            text: bq.text,
            points: bq.points,
            order: startOrder + idx,
            correctAnswerText: bq.correctAnswerText,
            options: bq.options,
            imageUrl: bq.imageUrl,
            metadata: {
                topic: bq.topic,
                difficulty: bq.difficulty
            }
        }));

        const inserted = await Question.insertMany(examQuestions);
        
        await logAudit(req, 'IMPORT_BANK_QUESTIONS', 'Exam', examId, `Imported ${inserted.length} questions from bank`);

        res.json({
            success: true,
            message: `${inserted.length} question(s) imported into exam`,
            imported: inserted.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/question-bank/stats
exports.getBankStats = async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'college_admin') {
            filter.collegeId = req.user.collegeId;
        } else if (req.query.collegeId) {
            filter.collegeId = req.query.collegeId;
        }

        const [total, byDifficulty, bySubject, byBlooms, byCourse] = await Promise.all([
            QuestionBank.countDocuments(filter),
            QuestionBank.aggregate([
                { $match: filter },
                { $group: { _id: '$difficulty', count: { $sum: 1 } } }
            ]),
            QuestionBank.aggregate([
                { $match: filter },
                { $group: { _id: '$subject', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            QuestionBank.aggregate([
                { $match: filter },
                { $group: { _id: '$bloomsLevel', count: { $sum: 1 } } }
            ]),
            QuestionBank.aggregate([
                { $match: filter },
                { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'course' } },
                { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
                { $group: { _id: { id: '$courseId', name: '$course.name' }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        res.json({
            success: true,
            data: { total, byDifficulty, bySubject, byBlooms, byCourse }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
