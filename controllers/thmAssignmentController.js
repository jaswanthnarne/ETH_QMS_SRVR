const THMRoomAssignment = require('../models/THMRoomAssignment');
const StudentRoomProgress = require('../models/StudentRoomProgress');
const Student = require('../models/Student');
const Batch = require('../models/Batch');

// Helper to sync single student TryHackMe progress
async function syncStudentTHMRooms(student, batchId) {
    if (!student.externalHandles || !student.externalHandles.tryhackme) {
        return 0;
    }

    try {
        const username = student.externalHandles.tryhackme.trim();
        const response = await fetch(`https://tryhackme.com/api/user/completed-rooms/${username}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`TryHackMe API returned status ${response.status}`);
        }

        const completedRooms = await response.json();
        if (!Array.isArray(completedRooms)) {
            throw new Error("Invalid response format from TryHackMe API");
        }

        // Get all assignments for this batch
        const assignments = await THMRoomAssignment.find({ batchId });
        
        let completedCount = 0;
        let totalScore = 0;

        for (const asm of assignments) {
            const isCompleted = completedRooms.some(r => 
                (r.code && r.code.toLowerCase() === asm.roomCode.toLowerCase()) || 
                (r.title && r.title.toLowerCase() === asm.title.toLowerCase())
            );

            if (isCompleted) {
                completedCount++;
                totalScore += asm.maxMarks;

                await StudentRoomProgress.findOneAndUpdate(
                    { studentId: student._id, assignmentId: asm._id },
                    { 
                        status: 'completed', 
                        obtainedMarks: asm.maxMarks,
                        completedAt: new Date()
                    },
                    { upsert: true, new: true }
                );
            } else {
                await StudentRoomProgress.findOneAndUpdate(
                    { studentId: student._id, assignmentId: asm._id },
                    { 
                        status: 'pending', 
                        obtainedMarks: 0
                    },
                    { upsert: true, new: true }
                );
            }
        }

        student.externalScore = totalScore;
        student.externalBadges = completedCount;
        await student.save();

        return completedCount;
    } catch (err) {
        console.error(`Failed to sync TryHackMe rooms for ${student.name}:`, err.message);
        return student.externalBadges || 0;
    }
}

// @desc    Assign a TryHackMe Room
// @route   POST /api/trainer/batches/:batchId/thm-rooms
// @access  Private (Trainer)
exports.createTHMAssignment = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { roomNumber, roomCode, title, maxMarks, dueDate } = req.body;

        if (!roomNumber || !roomCode || !title || !maxMarks || !dueDate) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }

        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found.' });
        }

        const assignment = await THMRoomAssignment.create({
            batchId,
            roomNumber,
            roomCode,
            title,
            maxMarks,
            dueDate
        });

        // Trigger sync in background for all students
        const students = await Student.find({ batchId });
        for (const student of students) {
            await syncStudentTHMRooms(student, batchId);
        }

        res.status(201).json({ success: true, data: assignment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get all Assigned TryHackMe Rooms
// @route   GET /api/trainer/batches/:batchId/thm-rooms
// @access  Private (Trainer, Student)
exports.getTHMAssignments = async (req, res) => {
    try {
        const { batchId } = req.params;
        const assignments = await THMRoomAssignment.find({ batchId }).sort({ roomNumber: 1 });

        const studentObj = req.user || req.student;
        const isStudent = req.student || (req.user && req.user.role !== 'trainer');

        if (isStudent && studentObj) {
            const progresses = await StudentRoomProgress.find({ studentId: studentObj._id });
            const progressMap = {};
            progresses.forEach(p => {
                progressMap[p.assignmentId.toString()] = p.status;
            });
            const assignmentsWithStatus = assignments.map(asm => ({
                ...asm.toObject(),
                status: progressMap[asm._id.toString()] || 'pending'
            }));
            return res.json({ success: true, data: assignmentsWithStatus });
        }

        res.json({ success: true, data: assignments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper to find assignment by ObjectId, roomNumber, or roomCode
async function findAssignmentByAnyId(roomId, batchId) {
    if (!roomId) return null;
    const mongoose = require('mongoose');
    let assignment = null;

    if (mongoose.Types.ObjectId.isValid(roomId)) {
        assignment = await THMRoomAssignment.findById(roomId);
    }
    if (!assignment) {
        try { assignment = await THMRoomAssignment.findOne({ _id: roomId }); } catch (e) {}
    }
    if (!assignment && batchId && !isNaN(roomId)) {
        assignment = await THMRoomAssignment.findOne({ batchId, roomNumber: parseInt(roomId) });
    }
    if (!assignment && batchId) {
        assignment = await THMRoomAssignment.findOne({ batchId, roomCode: roomId });
    }

    return assignment;
}

// @desc    Delete Assigned Room
// @route   DELETE /api/trainer/batches/:batchId/thm-rooms/:roomId
// @access  Private (Trainer)
exports.deleteTHMAssignment = async (req, res) => {
    try {
        const { roomId, batchId } = req.params;
        const assignment = await findAssignmentByAnyId(roomId, batchId);

        if (!assignment) {
            return res.status(404).json({ success: false, error: 'Assignment not found.' });
        }

        await THMRoomAssignment.findByIdAndDelete(assignment._id);
        await StudentRoomProgress.deleteMany({ assignmentId: assignment._id });

        res.json({ success: true, message: 'Assignment deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Batch Students THM Progress details
// @route   GET /api/trainer/batches/:batchId/thm-progress
// @access  Private (Trainer)
exports.getBatchTHMProgress = async (req, res) => {
    try {
        const { batchId } = req.params;
        const students = await Student.find({ batchId });
        const assignments = await THMRoomAssignment.find({ batchId }).sort({ roomNumber: 1 });

        const rosterProgress = [];
        for (const s of students) {
            // First sync to get latest values from TryHackMe API
            await syncStudentTHMRooms(s, batchId);

            const progresses = await StudentRoomProgress.find({ studentId: s._id });
            const progressMap = {};
            progresses.forEach(p => {
                progressMap[p.assignmentId.toString()] = {
                    status: p.status,
                    obtainedMarks: p.obtainedMarks,
                    completedAt: p.completedAt
                };
            });

            const roomStatuses = assignments.map(asm => {
                const prog = progressMap[asm._id.toString()];
                return {
                    assignmentId: asm._id,
                    roomNumber: asm.roomNumber,
                    roomCode: asm.roomCode,
                    title: asm.title,
                    status: prog ? prog.status : 'pending',
                    obtainedMarks: prog ? prog.obtainedMarks : 0,
                    completedAt: prog ? prog.completedAt : null
                };
            });

            rosterProgress.push({
                studentId: s._id,
                name: s.name,
                usn: s.usn,
                department: s.department,
                tryhackmeHandle: s.externalHandles?.tryhackme || '—',
                roomsCompleted: s.externalBadges || 0,
                totalScore: s.externalScore || 0,
                progress: roomStatuses
            });
        }

        res.json({
            success: true,
            data: {
                assignments,
                roster: rosterProgress
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Single Room Details & Student Progress
// @route   GET /api/admin/batches/:batchId/thm-rooms/:roomId
// @access  Private (Trainer, Admin)
exports.getTHMAssignmentById = async (req, res) => {
    try {
        const { roomId, batchId } = req.params;
        const assignment = await findAssignmentByAnyId(roomId, batchId);

        if (!assignment) {
            return res.status(404).json({ success: false, error: 'Assignment not found.' });
        }

        // Get students in this batch
        const students = await Student.find({ batchId }).select('name usn department externalHandles');
        
        // Get progress for this specific assignment
        const progresses = await StudentRoomProgress.find({ assignmentId: assignment._id });
        const progressMap = {};
        progresses.forEach(p => {
            progressMap[p.studentId.toString()] = p;
        });

        const studentProgress = students.map(s => {
            const prog = progressMap[s._id.toString()];
            return {
                studentId: s._id,
                name: s.name,
                usn: s.usn,
                department: s.department,
                tryhackmeHandle: s.externalHandles?.tryhackme || '—',
                status: prog ? prog.status : 'pending',
                obtainedMarks: prog ? prog.obtainedMarks : 0,
                completedAt: prog ? prog.completedAt : null
            };
        });

        res.json({
            success: true,
            data: {
                assignment,
                roster: studentProgress
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update Single Room Details
// @route   PUT /api/admin/batches/:batchId/thm-rooms/:roomId
// @access  Private (Trainer, Admin)
exports.updateTHMAssignment = async (req, res) => {
    try {
        const { roomId, batchId } = req.params;
        const { roomNumber, roomCode, title, maxMarks, dueDate } = req.body;

        const assignment = await findAssignmentByAnyId(roomId, batchId);
        if (!assignment) {
            return res.status(404).json({ success: false, error: 'Assignment not found.' });
        }

        if (roomNumber !== undefined) assignment.roomNumber = roomNumber;
        if (roomCode !== undefined) assignment.roomCode = roomCode;
        if (title !== undefined) assignment.title = title;
        if (maxMarks !== undefined) assignment.maxMarks = maxMarks;
        if (dueDate !== undefined) assignment.dueDate = dueDate;

        await assignment.save();

        // Also update any completed student's marks to match the new maxMarks
        if (maxMarks !== undefined) {
            await StudentRoomProgress.updateMany(
                { assignmentId: assignment._id, status: 'completed' },
                { obtainedMarks: maxMarks }
            );
        }

        res.json({ success: true, message: 'Assignment updated successfully.', data: assignment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.syncStudentTHMRooms = syncStudentTHMRooms;
