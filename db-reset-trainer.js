require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eth_quiz';

mongoose.connect(MONGO_URI).then(async () => {
    try {
        const trainer = await User.findOne({ username: 'ETH 025' });
        if (trainer) {
            trainer.password = 'Ethnotech@123';
            await trainer.save();
            console.log('Successfully set password for trainer "ETH 025" to "Ethnotech@123"');
        } else {
            console.log('Trainer "ETH 025" not found.');
        }
    } catch (e) {
        console.error('Error resetting password:', e);
    }
    process.exit(0);
});
