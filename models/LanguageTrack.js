const mongoose = require('mongoose');

const SyntaxRowSchema = new mongoose.Schema(
    {
        construct: { type: String, required: true, trim: true },
        syntax: { type: String, required: true },
        description: { type: String, default: '' }
    },
    { _id: false }
);

const CodeExampleSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        code: { type: String, required: true },
        output: { type: String, default: '' },
        explanation: { type: String, default: '' }
    },
    { _id: false }
);

const ProblemStatementSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        difficulty: {
            type: String,
            enum: ['Easy', 'Medium', 'Hard'],
            default: 'Easy'
        },
        statement: { type: String, required: true },
        sampleInput: { type: String, default: '' },
        sampleOutput: { type: String, default: '' },
        constraints: { type: String, default: '' },
        hint: { type: String, default: '' },
        starterCode: { type: String, default: '' }
    },
    { _id: false }
);

const GraphBarSchema = new mongoose.Schema(
    {
        label: { type: String, required: true },
        value: { type: Number, required: true },
        unit: { type: String, default: '' },
        displayValue: { type: String, default: '' },
        note: { type: String, default: '' }
    },
    { _id: false }
);

const ChapterImageSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        caption: { type: String, default: '' }
    },
    { _id: false }
);

const SubTopicSchema = new mongoose.Schema(
    {
        topicNumber: { type: Number, required: true },
        title: { type: String, required: true, trim: true },
        badge: { type: String, default: '' },
        duration: { type: String, default: '12 min read' },
        difficulty: { type: String, default: 'Beginner' },
        summary: { type: String, default: '' },
        content: { type: String, default: '' },
        keyTakeaways: [{ type: String }],
        illustrationType: { type: String, default: 'architecture' },
        diagramTitle: { type: String, default: '' },
        diagramSteps: [{ type: String }],
        graphTitle: { type: String, default: '' },
        graphMetricLabel: { type: String, default: '' },
        graphData: [GraphBarSchema],
        images: [ChapterImageSchema],
        syntaxCode: { type: String, default: '' },
        syntaxTable: [SyntaxRowSchema],
        examples: [CodeExampleSchema],
        problems: [ProblemStatementSchema]
    },
    { _id: false }
);

const ChapterSchema = new mongoose.Schema(
    {
        chapterNumber: { type: Number, required: true },
        title: { type: String, required: true, trim: true },
        duration: { type: String, default: '15 min read' },
        difficulty: {
            type: String,
            enum: ['Beginner', 'Intermediate', 'Advanced'],
            default: 'Beginner'
        },
        summary: { type: String, default: '' },
        overview: { type: String, required: true },
        keyPoints: [{ type: String }],
        syntaxSummaryCode: { type: String, default: '' },
        syntaxTable: [SyntaxRowSchema],
        diagramTitle: { type: String, default: 'Execution & Architecture Flow' },
        diagramSteps: [{ type: String }],
        graphTitle: { type: String, default: 'Performance & Complexity Benchmark' },
        graphMetricLabel: { type: String, default: 'Relative Efficiency Score' },
        graphData: [GraphBarSchema],
        images: [ChapterImageSchema],
        examples: [CodeExampleSchema],
        problems: [ProblemStatementSchema],
        subTopics: [SubTopicSchema]
    },
    { _id: true }
);

const LanguageTrackSchema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        name: { type: String, required: true, trim: true },
        fullName: { type: String, default: '' },
        badge: { type: String, default: '' },
        tagline: { type: String, default: '' },
        description: { type: String, default: '' },
        accentColor: { type: String, default: '#004AAD' },
        secondaryColor: { type: String, default: '#E0F2FE' },
        fileExtension: { type: String, default: '.txt' },
        paradigm: { type: String, default: 'Multi-Paradigm' },
        creatorInfo: { type: String, default: '' },
        logoUrl: { type: String, default: '' },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        chapters: [ChapterSchema],
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

module.exports = mongoose.model('LanguageTrack', LanguageTrackSchema);
