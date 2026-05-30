require('dotenv').config();
const mongoose = require('mongoose');
const StudentAttempt = require('./models/StudentAttempt');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eth_quiz').then(async () => {
    try {
        const counts = await StudentAttempt.aggregate([
            { $group: { _id: "$trainerId", count: { $sum: 1 } } }
        ]);
        console.log("Aggregate outcome:", counts);
        const allAttempts = await StudentAttempt.find({}, 'trainerId').lean();
        console.log("All attempts length:", allAttempts.length);
        if (allAttempts.length > 0) {
            console.log("Sample trainerId:", allAttempts[0]);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
