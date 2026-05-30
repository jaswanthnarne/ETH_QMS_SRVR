const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

mongoose.connect('mongodb+srv://Jashu:db%40admin%21Ethno%2398@cluster0.3tszizk.mongodb.net/qms')
.then(async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('password123', salt);
    
    await User.updateMany({ role: 'trainer' }, { $set: { password: hash } });
    console.log('All trainers reset to password123');
    process.exit(0);
})
.catch(err => {
    console.error(err);
    process.exit(1);
});
