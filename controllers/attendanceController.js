const mongoose = require('mongoose');
const AttendanceSession = require('../models/AttendanceSession');
const Batch = require('../models/Batch');
const Student = require('../models/Student');
const { logAudit } = require('../utils/auditHelper');

// Helper to check if trainer has access to a specific college
const checkTrainerCollegeAccess = (user, collegeId) => {
    if (user.role !== 'trainer') return true;
    const collegesList = [
        ...(user.collegeId ? [user.collegeId.toString()] : []),
        ...(Array.isArray(user.assignedColleges) ? user.assignedColleges.map(c => c.toString()) : [])
    ];
    return collegesList.includes(collegeId.toString());
};

// @desc    Record/Mark attendance for a new class session
// @route   POST /api/attendance
// @access  Private (Trainer or Admin)
exports.recordAttendance = async (req, res) => {
    try {
        const { batchId, date, topic, duration, period, records, module } = req.body;

        if (!batchId || !date || !topic || !records || !Array.isArray(records)) {
            return res.status(400).json({ success: false, error: 'Batch, date, topic, and student records array are required' });
        }

        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Validate trainer permissions for batch's college
        if (!checkTrainerCollegeAccess(req.user, batch.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to record attendance for this college' });
        }

        // Create session
        const session = await AttendanceSession.create({
            batchId,
            collegeId: batch.collegeId,
            courseId: batch.courseId || null,
            trainerId: req.user._id,
            date: new Date(date),
            topic,
            duration: duration || 60,
            period: period || 'Session 1',
            module: module || 'Module 1',
            records: records.map(r => ({
                studentId: r.studentId,
                status: r.status || 'present',
                remarks: r.remarks || ''
            }))
        });

        // Audit Trail
        await logAudit(req, 'RECORD_ATTENDANCE', 'AttendanceSession', session._id, `${batch.batchName} - ${topic}`, {
            date,
            totalStudents: records.length
        });

        // Socket IO Update
        const io = req.app?.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'attendance',
                action: 'create',
                data: { id: session._id, batchId, collegeId: batch.collegeId },
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get all attendance sessions recorded for a batch
// @route   GET /api/attendance/batch/:batchId
// @access  Private (Trainer or Admin)
exports.getBatchAttendance = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Validate trainer permissions
        if (!checkTrainerCollegeAccess(req.user, batch.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to view attendance logs' });
        }

        const sessions = await AttendanceSession.find({ batchId })
            .populate('trainerId', 'firstName lastName')
            .sort({ date: -1, createdAt: -1 });

        res.json({ success: true, count: sessions.length, data: sessions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get details of a single attendance session
// @route   GET /api/attendance/session/:id
// @access  Private (Trainer or Admin)
exports.getSessionDetails = async (req, res) => {
    try {
        const session = await AttendanceSession.findById(req.params.id)
            .populate('batchId', 'batchName')
            .populate('trainerId', 'firstName lastName')
            .populate('records.studentId', 'name usn department division');

        if (!session) {
            return res.status(404).json({ success: false, error: 'Attendance session not found' });
        }

        // Validate trainer permissions
        if (!checkTrainerCollegeAccess(req.user, session.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to view session logs' });
        }

        res.json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update/Edit an attendance session
// @route   PUT /api/attendance/session/:id
// @access  Private (Trainer or Admin)
exports.updateAttendance = async (req, res) => {
    try {
        const { topic, duration, period, records, module } = req.body;
        const session = await AttendanceSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({ success: false, error: 'Attendance session not found' });
        }

        // Check trainer permissions
        if (!checkTrainerCollegeAccess(req.user, session.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to modify session logs' });
        }

        // Edit lock grace period check for trainers (72 hours from creation)
        if (req.user.role === 'trainer') {
            const timeDiff = Date.now() - new Date(session.createdAt).getTime();
            const lockTime = 72 * 60 * 60 * 1000; // 72 hours
            if (timeDiff > lockTime) {
                return res.status(403).json({
                    success: false,
                    error: 'Editing window has closed. Past attendance logs are locked after 72 hours. Please contact an administrator.'
                });
            }
        }

        // Update fields if provided
        if (topic) session.topic = topic;
        if (duration !== undefined) session.duration = duration;
        if (period) session.period = period;
        if (module) session.module = module;
        if (records && Array.isArray(records)) {
            session.records = records.map(r => ({
                studentId: r.studentId,
                status: r.status,
                remarks: r.remarks || ''
            }));
        }

        await session.save();

        // Audit Trail
        await logAudit(req, 'UPDATE_ATTENDANCE', 'AttendanceSession', session._id, session.topic, {
            recordsCount: records?.length
        });

        // Socket IO Update
        const io = req.app?.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'attendance',
                action: 'update',
                data: { id: session._id, batchId: session.batchId },
                timestamp: new Date()
            });
        }

        res.json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Delete an attendance session
// @route   DELETE /api/attendance/session/:id
// @access  Private (Admin or Trainer with locks)
exports.deleteAttendance = async (req, res) => {
    try {
        const session = await AttendanceSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Attendance session not found' });
        }

        // Validate permissions
        if (req.user.role === 'trainer') {
            // Lock check for deleting
            const timeDiff = Date.now() - new Date(session.createdAt).getTime();
            const lockTime = 72 * 60 * 60 * 1000;
            if (timeDiff > lockTime) {
                return res.status(403).json({ success: false, error: 'Deleting is locked for older logs. Please contact an admin.' });
            }
            if (session.trainerId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'You can only delete attendance sessions logged by yourself' });
            }
        }

        await session.deleteOne();

        // Audit Trail
        await logAudit(req, 'DELETE_ATTENDANCE', 'AttendanceSession', session._id, session.topic);

        // Socket Update
        const io = req.app?.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'attendance',
                action: 'delete',
                data: { id: session._id, batchId: session.batchId },
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Attendance session deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Generate a student-by-student attendance percentage report for a batch
// @route   GET /api/attendance/reports/batch/:batchId
// @access  Private (Trainer or Admin)
exports.getBatchAttendanceReport = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Validate permissions
        if (!checkTrainerCollegeAccess(req.user, batch.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to view reports for this college' });
        }

        // Fetch students and sessions
        const students = await Student.find({ batchId, status: 'active' }).sort({ name: 1 });
        const sessions = await AttendanceSession.find({ batchId });

        const totalSessions = sessions.length;

        // Calculate attendance summary per student
        const studentSummaries = students.map(student => {
            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            let excusedCount = 0;
            let unattendedCount = 0;

            sessions.forEach(sess => {
                const record = sess.records.find(r => r.studentId.toString() === student._id.toString());
                if (record) {
                    if (record.status === 'present') presentCount++;
                    else if (record.status === 'absent') absentCount++;
                    else if (record.status === 'late') lateCount++;
                    else if (record.status === 'excused') excusedCount++;
                } else {
                    unattendedCount++;
                }
            });

            // Count late as present (or customize if late counts as partial attendance)
            const attendedCount = presentCount + lateCount;
            const attendancePercentage = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 100;

            return {
                studentId: student._id,
                name: student.name,
                usn: student.usn,
                department: student.department || '—',
                division: student.division || '—',
                email: student.email || '—',
                mobile: student.mobile || '—',
                present: presentCount,
                absent: absentCount,
                late: lateCount,
                excused: excusedCount,
                unattended: unattendedCount,
                attended: attendedCount,
                percentage: attendancePercentage,
                isLow: totalSessions > 0 && attendancePercentage < 75 // 75% warning flag
            };
        });

        res.json({
            success: true,
            totalSessions,
            batchName: batch.batchName,
            data: studentSummaries
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Generate chronological attendance log for a single student
// @route   GET /api/attendance/reports/student/:studentId
// @access  Private (Trainer or Admin)
exports.getStudentAttendanceReport = async (req, res) => {
    try {
        const { studentId } = req.params;
        const student = await Student.findById(studentId).populate('batchId', 'batchName');
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        // Validate permissions
        if (!checkTrainerCollegeAccess(req.user, student.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to view student details' });
        }

        // Find all sessions of the batch containing records for this student
        const sessions = await AttendanceSession.find({
            batchId: student.batchId._id,
            'records.studentId': studentId
        })
        .populate('trainerId', 'firstName lastName')
        .sort({ date: -1 });

        const history = sessions.map(sess => {
            const record = sess.records.find(r => r.studentId.toString() === studentId.toString());
            return {
                sessionId: sess._id,
                date: sess.date,
                topic: sess.topic,
                period: sess.period,
                duration: sess.duration,
                trainer: sess.trainerId ? `${sess.trainerId.firstName} ${sess.trainerId.lastName}` : 'Unassigned',
                status: record ? record.status : 'unrecorded',
                remarks: record ? record.remarks : ''
            };
        });

        const totalSessions = sessions.length;
        const attended = history.filter(h => h.status === 'present' || h.status === 'late').length;
        const percentage = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 100;

        res.json({
            success: true,
            student: {
                name: student.name,
                usn: student.usn,
                batchName: student.batchId.batchName
            },
            summary: {
                totalSessions,
                attended,
                percentage
            },
            data: history
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Generate a day-wise attendance matrix for a batch (students × sessions)
// @route   GET /api/attendance/reports/batch/:batchId/daywise
// @access  Private (Admin)
exports.getBatchDaywiseReport = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await Batch.findById(batchId)
            .populate('collegeId', 'name')
            .populate('courseId', 'name code');

        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        // Validate permissions
        if (!checkTrainerCollegeAccess(req.user, batch.collegeId._id || batch.collegeId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to view reports for this college' });
        }

        // Fetch all sessions sorted by date ascending (chronological)
        const sessions = await AttendanceSession.find({ batchId })
            .populate('trainerId', 'firstName lastName')
            .sort({ date: 1, createdAt: 1 });

        // Fetch all active students in the batch
        const students = await Student.find({ batchId, status: 'active' }).sort({ name: 1 });

        // Build session metadata list
        const sessionMeta = sessions.map(s => ({
            sessionId: s._id.toString(),
            date: s.date,
            topic: s.topic,
            period: s.period,
            module: s.module || 'Module 1',
            trainer: s.trainerId ? `${s.trainerId.firstName} ${s.trainerId.lastName}` : 'Unassigned'
        }));

        const totalSessions = sessions.length;

        // Build per-student records matrix
        const studentRows = students.map(student => {
            const records = {};
            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            let excusedCount = 0;

            sessions.forEach(sess => {
                const rec = sess.records.find(r => r.studentId.toString() === student._id.toString());
                const status = rec ? rec.status : 'absent'; // If not in records, treat as absent
                records[sess._id.toString()] = status;

                if (status === 'present') presentCount++;
                else if (status === 'absent') absentCount++;
                else if (status === 'late') lateCount++;
                else if (status === 'excused') excusedCount++;
            });

            const attendedCount = presentCount + lateCount;
            const percentage = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 100;

            return {
                studentId: student._id,
                name: student.name,
                usn: student.usn,
                department: student.department || '—',
                division: student.division || '—',
                records,
                summary: {
                    present: presentCount,
                    absent: absentCount,
                    late: lateCount,
                    excused: excusedCount,
                    attended: attendedCount,
                    percentage
                }
            };
        });

        res.json({
            success: true,
            batchName: batch.batchName,
            collegeName: batch.collegeId?.name || '—',
            courseName: batch.courseId ? `${batch.courseId.name} (${batch.courseId.code})` : '—',
            department: batch.department || '—',
            totalSessions,
            sessions: sessionMeta,
            students: studentRows
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
