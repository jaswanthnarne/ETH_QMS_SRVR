const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const Exam = require('./models/Exam');
const Question = require('./models/Question');
const College = require('./models/College');
const Course = require('./models/Course');
const Batch = require('./models/Batch');
const User = require('./models/User');
const TrainerExamKey = require('./models/TrainerExamKey');

async function main() {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    // 1. Find college, course, batch, user
    const college = await College.findOne();
    if (!college) throw new Error('No college found');
    console.log(`Found college: ${college.name} (${college._id})`);

    const course = await Course.findOne();
    if (!course) throw new Error('No course found');
    console.log(`Found course: ${course.name} (${course._id})`);

    let batch = await Batch.findOne({ collegeId: college._id });
    if (!batch) {
        batch = await Batch.findOne();
    }
    if (!batch) {
        batch = await Batch.create({
            batchName: 'Section Test Batch',
            collegeId: college._id,
            courseId: course._id,
            department: 'CS',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
    }
    console.log(`Found batch: ${batch.batchName} (${batch._id})`);

    const trainer = await User.findOne({ role: { $in: ['trainer', 'super_admin'] } });
    if (!trainer) throw new Error('No trainer/admin found');
    console.log(`Found trainer: ${trainer.username} (${trainer._id})`);

    // 2. Create the Exam
    console.log('Creating exam...');
    const exam = await Exam.create({
        collegeId: college._id,
        courseId: course._id,
        batches: [batch._id],
        title: 'Sectioned Test Exam with Negative Marking',
        description: 'Testing Aptitude and Technical sections with -0.25 penalty.',
        duration: 30,
        passingPercentage: 40,
        instructions: 'Please answer all questions. Section navigation is enabled.',
        status: 'published',
        createdBy: trainer._id,
        settings: {
            shuffleQuestions: false,
            showResultImmediately: true,
            allowReview: true,
            collectEmail: false,
            collectMobile: true,
            collectDepartment: true,
            enableCertificate: false,
            enableSections: true,
            enableNegativeMarking: true,
            negativeMarkValue: 0.25,
            randomizeQuestions: false,
            requireWebcam: false,
            requireMic: false,
            requireScreenshare: false
        },
        sections: [
            { name: 'Aptitude Section', description: 'Basic math and logic', order: 0 },
            { name: 'Technical Section', description: 'Programming questions', order: 1 }
        ]
    });
    console.log(`Created exam: ${exam.title} (${exam._id})`);

    // 3. Create Questions
    console.log('Creating questions...');
    const qData = [
        // Section Index 0 (Aptitude)
        {
            examId: exam._id,
            type: 'single_correct',
            text: 'What is 15 + 30?',
            points: 1,
            order: 0,
            sectionIndex: 0,
            options: {
                choices: [
                    { id: 'opt_0', text: '35', isCorrect: false },
                    { id: 'opt_1', text: '45', isCorrect: true },
                    { id: 'opt_2', text: '55', isCorrect: false },
                    { id: 'opt_3', text: '65', isCorrect: false }
                ]
            }
        },
        {
            examId: exam._id,
            type: 'true_false',
            text: 'Is 25 a perfect square?',
            points: 1,
            order: 1,
            sectionIndex: 0,
            options: {
                choices: [
                    { id: 'opt_0', text: 'True', isCorrect: true },
                    { id: 'opt_1', text: 'False', isCorrect: false }
                ]
            }
        },
        // Section Index 1 (Technical)
        {
            examId: exam._id,
            type: 'single_correct',
            text: 'Which HTML tag is used for the largest heading?',
            points: 2,
            order: 2,
            sectionIndex: 1,
            options: {
                choices: [
                    { id: 'opt_0', text: '<h6>', isCorrect: false },
                    { id: 'opt_1', text: '<h1>', isCorrect: true },
                    { id: 'opt_2', text: 'heading', isCorrect: false },
                    { id: 'opt_3', text: 'head', isCorrect: false }
                ]
            }
        },
        {
            examId: exam._id,
            type: 'multiple_correct',
            text: 'Which of the following are valid Javascript declaration keywords?',
            points: 2,
            order: 3,
            sectionIndex: 1,
            options: {
                choices: [
                    { id: 'opt_0', text: 'var', isCorrect: true },
                    { id: 'opt_1', text: 'let', isCorrect: true },
                    { id: 'opt_2', text: 'define', isCorrect: false },
                    { id: 'opt_3', text: 'make', isCorrect: false }
                ]
            }
        }
    ];

    await Question.insertMany(qData);
    console.log('Questions inserted.');

    // Update total marks on the exam
    exam.totalMarks = qData.reduce((sum, q) => sum + q.points, 0);
    await exam.save();
    console.log(`Updated exam total marks to: ${exam.totalMarks}`);

    // 4. Create Active Trainer Exam Key
    console.log('Generating active exam key...');
    const randomKey = Math.floor(100000 + Math.random() * 900000).toString();
    const keyDoc = await TrainerExamKey.create({
        examId: exam._id,
        trainerId: trainer._id,
        batchId: batch._id,
        uniqueKey: randomKey,
        isActive: true,
        isStarted: true
    });

    console.log('\n======================================================');
    console.log('🎉 TEST EXAM CREATION COMPLETE!');
    console.log(`👉 Exam Title: ${exam.title}`);
    console.log(`👉 Associated Batch: ${batch.batchName}`);
    console.log(`👉 Trainer/Admin: ${trainer.username}`);
    console.log(`👉 Active Exam Key: ${keyDoc.uniqueKey}`);
    console.log('======================================================\n');
    console.log('Use this active exam key to write the exam as a student.');
}

main()
    .then(() => mongoose.disconnect())
    .catch(err => {
        console.error(err);
        mongoose.disconnect();
    });
