const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
// Trust reverse proxy headers (Vercel, Cloudflare, Nginx, etc.) to get correct client IPs
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('socketio', io);

// Middleware
app.use(express.json());

const allowedOrigins = [
    'https://eth-qms-ui-b2md.vercel.app',
    'https://ethops.jaswanthnarne.online',
    'http://localhost',
    'https://localhost',
    'http://localhost:5173',
    'http://localhost:5000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.includes(origin) || 
                          origin.startsWith('http://localhost') || 
                          origin.startsWith('https://localhost') ||
                          origin.startsWith('http://127.0.0.1') ||
                          origin.endsWith('jaswanthnarne.online') ||
                          origin.endsWith('vercel.app');
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(helmet());
app.use(morgan('dev'));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiters
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, error: 'Too many login attempts, please try again after 15 minutes' } });
const examLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 600, // Permissive up to 600 requests per minute per unique candidate key
    validate: false, // Disable all internal validator warnings/validations for custom composite keyGenerator
    keyGenerator: (req) => {
        // Build composite key: IP + exam key + roll number (if available)
        // This isolates students in a shared NAT IP computer lab so they do not throttle each other.
        const roll = req.body?.rollNumber || req.query?.rollNumber || req.body?.studentDetails?.rollNumber || '';
        const examKey = req.body?.key || req.body?.examKey || req.query?.key || '';
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        if (roll || examKey) {
            return `${ip}_${examKey}_${roll}`;
        }
        return ip;
    },
    message: { success: false, error: 'Too many requests, please slow down' }
});

const TrainerExamKey = require('./models/TrainerExamKey');
const ChatMessage = require('./models/ChatMessage');

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Student joins an exam session
    socket.on('student_join', ({ examKey, studentName, rollNumber, mobile, studentId }) => {
        const roomId = `exam_${examKey}`;
        socket.join(roomId);
        socket.examKey = examKey;
        socket.role = 'student';
        socket.userInfo = { studentName, rollNumber, mobile, studentId };
        
        // Notify trainers in the room
        io.to(roomId).emit('student_status_update', {
            type: 'join',
            studentId,
            studentName,
            rollNumber,
            mobile,
            timestamp: new Date()
        });
        console.log(`Student ${studentName} joined exam room: ${roomId}`);
    });

    // Student updates progress
    socket.on('student_progress', ({ examKey, studentId, progress }) => {
        io.to(`exam_${examKey}`).emit('student_status_update', {
            type: 'progress',
            studentId,
            progress,
            timestamp: new Date()
        });
    });

    // Student violation (cheat detection)
    socket.on('student_violation', ({ examKey, studentId, studentName, violationType, count }) => {
        io.to(`exam_${examKey}`).emit('student_status_update', {
            type: 'violation',
            studentId,
            studentName,
            violationType,
            count,
            timestamp: new Date()
        });
    });

    // Student submits exam
    socket.on('student_submit', ({ examKey, studentId, studentName }) => {
        io.to(`exam_${examKey}`).emit('student_status_update', {
            type: 'submit',
            studentId,
            studentName,
            timestamp: new Date()
        });
    });

    // Trainer joins to monitor
    socket.on('trainer_monitor', async (examKey) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                // Find all active keys for this exam and trainer
                const allKeys = await TrainerExamKey.find({ 
                    examId: keyDoc.examId, 
                    trainerId: keyDoc.trainerId, 
                    isActive: true 
                });
                
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    socket.join(roomId);
                    console.log(`Trainer joined monitor room: ${roomId}`);
                });
            } else {
                const roomId = `exam_${examKey}`;
                socket.join(roomId);
                console.log(`Trainer joined monitor room (fallback): ${roomId}`);
            }
            socket.role = 'trainer';
        } catch (error) {
            console.error('Error in trainer_monitor:', error);
            const roomId = `exam_${examKey}`;
            socket.join(roomId);
            socket.role = 'trainer';
        }
    });

    // Trainer starts exam session
    socket.on('trainer_start_session', async (examKey) => {
        try {
            // Update DB so late joiners see it as started
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey }).populate('examId').populate('trainerId');
            if (keyDoc) {
                // Find all active keys for this exam and trainer
                const allKeys = await TrainerExamKey.find({ 
                    examId: keyDoc.examId?._id, 
                    trainerId: keyDoc.trainerId?._id, 
                    isActive: true 
                });
                const keyIds = [keyDoc._id, ...allKeys.map(k => k._id).filter(id => id.toString() !== keyDoc._id.toString())];

                await TrainerExamKey.updateMany(
                    { _id: { $in: keyIds } },
                    { isStarted: true }
                );
                
                const Notification = require('./models/Notification');
                const trainerName = keyDoc.trainerId 
                    ? `${keyDoc.trainerId.firstName || ''} ${keyDoc.trainerId.lastName || ''}`.trim() || keyDoc.trainerId.phone || keyDoc.trainerId.username 
                    : 'Trainer';
                
                // Avoid duplicate start notifications for the same session
                const existing = await Notification.findOne({
                    type: 'exam_started',
                    message: { $regex: examKey }
                });
                
                if (!existing) {
                    const notif = await Notification.create({
                        title: 'Exam Session Started',
                        message: `Trainer ${trainerName} started the exam session for "${keyDoc.examId?.title || 'Exam'}" (Key: ${examKey}).`,
                        type: 'exam_started',
                        collegeId: keyDoc.examId?.collegeId
                    });
                    
                    // Emit notification real-time to active listeners
                    io.emit('new_notification', {
                        ...notif.toObject(),
                        isRead: false
                    });
                }

                // Emit session_started to all these rooms
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('session_started', {
                        examKey: k.uniqueKey,
                        timestamp: new Date()
                    });
                    console.log(`Socket broadcast: started exam session for key: ${k.uniqueKey}`);
                });
            }
        } catch (error) {
            console.error('Error starting session in DB:', error);
        }
    });

    // Trainer instantly force-closes the exam session
    socket.on('trainer_end_session', async (examKey) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId });
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('session_ended', { examKey: k.uniqueKey, timestamp: new Date() });
                    console.log(`Socket broadcast: ended exam session for key: ${k.uniqueKey}`);
                });
            } else {
                io.to(`exam_${examKey}`).emit('session_ended', { examKey, timestamp: new Date() });
            }
        } catch (error) {
            console.error('Error in trainer_end_session:', error);
            io.to(`exam_${examKey}`).emit('session_ended', { examKey, timestamp: new Date() });
        }
    });

    socket.on('trainer_pause_session', async (examKey) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('session_paused', { examKey: k.uniqueKey, timestamp: new Date() });
                    console.log(`Socket broadcast: paused exam session for key: ${k.uniqueKey}`);
                });
            } else {
                io.to(`exam_${examKey}`).emit('session_paused', { examKey, timestamp: new Date() });
            }
        } catch (error) {
            console.error('Error in trainer_pause_session:', error);
            io.to(`exam_${examKey}`).emit('session_paused', { examKey, timestamp: new Date() });
        }
    });

    socket.on('trainer_resume_session', async (examKey) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('session_resumed', { examKey: k.uniqueKey, timestamp: new Date() });
                    console.log(`Socket broadcast: resumed exam session for key: ${k.uniqueKey}`);
                });
            } else {
                io.to(`exam_${examKey}`).emit('session_resumed', { examKey, timestamp: new Date() });
            }
        } catch (error) {
            console.error('Error in trainer_resume_session:', error);
            io.to(`exam_${examKey}`).emit('session_resumed', { examKey, timestamp: new Date() });
        }
    });

    socket.on('trainer_restart_session', async (examKey) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId });
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('session_started', { examKey: k.uniqueKey, timestamp: new Date() });
                    console.log(`Socket broadcast: restarted/started exam session for key: ${k.uniqueKey}`);
                });
            }
        } catch (error) {
            console.error('Error in trainer_restart_session:', error);
        }
    });

    // ========== LIVE CHAT (Student <-> Trainer) ==========
    socket.on('chat_message', async ({ examKey, senderRole, senderName, senderId, message, recipientId }) => {
        try {
            // Persist the message
            const chatMsg = await ChatMessage.create({
                examKey,
                senderRole,
                senderName,
                senderId,
                message,
                recipientId: recipientId || null
            });

            // Broadcast to the room (trainers + that student)
            if (senderRole === 'trainer') {
                const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
                if (keyDoc) {
                    const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
                    allKeys.forEach(k => {
                        const roomId = `exam_${k.uniqueKey}`;
                        io.to(roomId).emit('chat_message', {
                            id: chatMsg._id,
                            examKey: k.uniqueKey,
                            senderRole,
                            senderName,
                            senderId,
                            message,
                            recipientId: recipientId || null,
                            timestamp: chatMsg.createdAt
                        });
                    });
                } else {
                    io.to(`exam_${examKey}`).emit('chat_message', {
                        id: chatMsg._id,
                        examKey,
                        senderRole,
                        senderName,
                        senderId,
                        message,
                        recipientId: recipientId || null,
                        timestamp: chatMsg.createdAt
                    });
                }
            } else {
                const roomId = `exam_${examKey}`;
                io.to(roomId).emit('chat_message', {
                    id: chatMsg._id,
                    examKey,
                    senderRole,
                    senderName,
                    senderId,
                    message,
                    recipientId: recipientId || null,
                    timestamp: chatMsg.createdAt
                });
            }
        } catch (error) {
            console.error('Chat message error:', error);
        }
    });

    // Fetch chat history when joining
    socket.on('fetch_chat_history', async ({ examKey }) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            let query = { examKey };
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId });
                query = { examKey: { $in: allKeys.map(k => k.uniqueKey) } };
            }
            const messages = await ChatMessage.find(query)
                .sort({ createdAt: 1 })
                .limit(200)
                .lean();
            socket.emit('chat_history', messages.map(m => ({
                id: m._id,
                examKey: m.examKey,
                senderRole: m.senderRole,
                senderName: m.senderName,
                senderId: m.senderId,
                message: m.message,
                recipientId: m.recipientId,
                timestamp: m.createdAt
            })));
        } catch (error) {
            console.error('Fetch chat history error:', error);
        }
    });

    // ========== BROADCAST ANNOUNCEMENTS (Trainer -> All Students) ==========
    socket.on('trainer_broadcast', async ({ examKey, message, trainerName }) => {
        try {
            const keyDoc = await TrainerExamKey.findOne({ uniqueKey: examKey });
            if (keyDoc) {
                const allKeys = await TrainerExamKey.find({ examId: keyDoc.examId, trainerId: keyDoc.trainerId, isActive: true });
                allKeys.forEach(k => {
                    const roomId = `exam_${k.uniqueKey}`;
                    io.to(roomId).emit('broadcast_announcement', {
                        message,
                        trainerName,
                        timestamp: new Date()
                    });
                });
                console.log(`Trainer broadcast in ${allKeys.length} rooms for exam ${keyDoc.examId}: "${message}"`);
            } else {
                io.to(`exam_${examKey}`).emit('broadcast_announcement', { message, trainerName, timestamp: new Date() });
            }
        } catch (error) {
            console.error('Error in trainer_broadcast:', error);
            io.to(`exam_${examKey}`).emit('broadcast_announcement', { message, trainerName, timestamp: new Date() });
        }
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        if (socket.role === 'student' && socket.examKey && socket.userInfo) {
            try {
                const TrainerExamKey = require('./models/TrainerExamKey');
                const StudentAttempt = require('./models/StudentAttempt');
                const trainerKey = await TrainerExamKey.findOne({ uniqueKey: socket.examKey });
                if (trainerKey) {
                    await StudentAttempt.findOneAndUpdate(
                        { examId: trainerKey.examId, 'studentDetails.rollNumber': socket.userInfo.rollNumber },
                        { lastDisconnected: new Date() }
                    );
                }
            } catch (err) {
                console.log('Error updating disconnect status:', err.message);
            }
        }
    });
});

// Routes
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/trainer', require('./routes/trainerRoutes'));
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/exam', examLimiter, require('./routes/examRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/question-bank', require('./routes/questionBankRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/placement', require('./routes/placementRoutes'));

app.get('/', (req, res) => {
    res.send('QMS API is running...');
});

// Automatically clean up stale disconnected student attempts
setInterval(async () => {
    try {
        const StudentAttempt = require('./models/StudentAttempt');
        const Question = require('./models/Question');
        
        // Find attempts in progress (started) where they disconnected more than 15 minutes ago
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const staleAttempts = await StudentAttempt.find({
            status: { $in: ['started', 'active', 'violated'] },
            lastDisconnected: { $lte: fifteenMinutesAgo }
        }).populate('examId');

        if (staleAttempts.length > 0) {
            console.log(`[Sweeper] Found ${staleAttempts.length} stale disconnected attempts to auto-submit.`);
            
            for (const attempt of staleAttempts) {
                if (!attempt.examId) continue;

                const questions = await Question.find({ examId: attempt.examId._id });
                let totalScore = 0;
                const processedQuestionIds = new Set();
                
                attempt.answers.forEach(a => {
                    const qIdStr = a.questionId.toString();
                    if (processedQuestionIds.has(qIdStr)) return;
                    processedQuestionIds.add(qIdStr);

                    const question = questions.find(q => q._id.toString() === qIdStr);
                    if (question) {
                        let isCorrect = false;
                        const ans = a.answer;

                        if (ans !== undefined && ans !== null && ans !== '') {
                            if (question.type === 'single_correct' || question.type === 'true_false' || question.type === 'mcq') {
                                const correctChoice = question.options?.choices?.find(c => c.isCorrect);
                                const ansStr = Array.isArray(ans) ? ans[0] : ans;
                                if (correctChoice) isCorrect = String(ansStr).trim().toLowerCase() === String(correctChoice.text).trim().toLowerCase();
                            } else if (question.type === 'multiple_correct' || question.type === 'multiple') {
                                const correctChoices = question.options?.choices?.filter(c => c.isCorrect).map(c => String(c.text).trim().toLowerCase()) || [];
                                const ansArr = Array.isArray(ans) ? ans.map(x => String(x).trim().toLowerCase()) : [String(ans).trim().toLowerCase()];
                                if (correctChoices.length === ansArr.length && correctChoices.length > 0) {
                                    isCorrect = correctChoices.every(c => ansArr.includes(c));
                                }
                            } else if (question.type === 'fill_blank' || question.type === 'fill_blanks') {
                                const ansStr = Array.isArray(ans) ? ans[0] : ans;
                                if (question.correctAnswerText) isCorrect = String(ansStr).trim().toLowerCase() === String(question.correctAnswerText).trim().toLowerCase();
                            } else if (question.type === 'numeric') {
                                const ansStr = Array.isArray(ans) ? ans[0] : ans;
                                const parsedAns = parseFloat(ansStr);
                                const parsedCorrect = parseFloat(question.correctAnswerText);
                                isCorrect = (!isNaN(parsedAns) && !isNaN(parsedCorrect) && parsedAns === parsedCorrect);
                            }
                        }

                        a.isCorrect = isCorrect;
                        if (isCorrect) {
                            a.marksObtained = question.points || 1;
                            totalScore += question.points || 1;
                        } else {
                            a.marksObtained = 0;
                        }
                    }
                });

                attempt.totalScore = totalScore;
                const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
                attempt.percentage = (totalScore / maxScore) * 100;
                attempt.result = attempt.percentage >= (attempt.examId.passingPercentage || 40) ? 'pass' : 'fail';
                attempt.status = 'completed';
                attempt.completedAt = new Date();
                
                if (!attempt.violations) attempt.violations = {};
                attempt.violations.reason = 'Auto-submitted by System Sweeper (Disconnected > 15 mins)';

                await attempt.save();
                console.log(`[Sweeper] Auto-submitted attempt for Roll: ${attempt.studentDetails?.rollNumber}, score: ${totalScore}/${maxScore}`);
            }
        }
    } catch (err) {
        console.error('[Sweeper] Error sweeping stale attempts:', err.message);
    }
}, 5 * 60 * 1000); // Run every 5 minutes

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
