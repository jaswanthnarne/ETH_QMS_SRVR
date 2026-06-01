require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eth_quiz';
console.log('Connecting to:', MONGO_URI);

mongoose.connect(MONGO_URI).then(async () => {
    try {
        const users = await User.find({}, 'firstName lastName email username role phone').lean();
        console.log('=== REGISTERED USERS ===');
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('Error fetching users:', e);
    }
    process.exit(0);
});
