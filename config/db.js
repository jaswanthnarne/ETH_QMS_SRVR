const mongoose = require('mongoose');

const connectDB = async () => {
    // If the connection is already established, reuse it immediately
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            maxPoolSize: 10, // Optimize socket pooling for serverless environments
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging indefinitely
            socketTimeoutMS: 45000 // Close sockets after 45s of inactivity
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
