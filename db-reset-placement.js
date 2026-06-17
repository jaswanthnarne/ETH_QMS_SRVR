require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eth_quiz';

mongoose.connect(MONGO_URI).then(async () => {
    try {
        const placement = await User.findOne({ username: 'placement_officer' });
        if (placement) {
            placement.password = 'Ethnotech@123';
            await placement.save();
            console.log('Successfully set password for placement_officer to "Ethnotech@123"');
        } else {
            console.log('placement_officer user not found.');
        }
    } catch (e) {
        console.error('Error resetting password:', e);
    }
    process.exit(0);
});
