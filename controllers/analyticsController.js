const StudentAttempt = require('../models/StudentAttempt');
const Exam = require('../models/Exam');
const User = require('../models/User');
const Course = require('../models/Course');
const College = require('../models/College');
const ExcelJS = require('exceljs');
const TrainingLog = require('../models/TrainingLog');
const TrainerExamKey = require('../models/TrainerExamKey');
const CollegeCourseMap = require('../models/CollegeCourseMap');
const TrainerCourseMap = require('../models/TrainerCourseMap');
const Batch = require('../models/Batch');
const Student = require('../models/Student');
const AttendanceSession = require('../models/AttendanceSession');
const Question = require('../models/Question');


// ========== Helper: style header row ==========
function styleHeader(sheet, color = 'FF004AAD') {
    const row = sheet.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.height = 22;
    row.commit();
}

function styleDataRow(row, isEven) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F4FF' : 'FFFFFFFF' } };
    row.alignment = { vertical: 'middle' };
    row.font = { name: 'Inter', size: 10 };
}

// ========== College Analytics ==========
exports.getCollegeAnalytics = async (req, res) => {
    try {
        const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
        const collegesList = isRegionalRole ? [
            ...(req.user.collegeId ? [req.user.collegeId] : []),
            ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
        ].map(id => id.toString()) : [];

        let collegeId = req.user.role === 'college_admin' ? req.user.collegeId : (req.query.collegeId || null);

        if (collegeId && isRegionalRole && !collegesList.includes(collegeId.toString())) {
            return res.status(403).json({ success: false, error: 'Unauthorized to view this college context' });
        }

        const { courseId, trainerId } = req.query;
        let examQuery = {};
        if (collegeId) {
            examQuery.collegeId = collegeId;
        } else if (isRegionalRole) {
            examQuery.collegeId = { $in: collegesList };
        }

        if (courseId) examQuery.courseId = courseId;

        const exams = await Exam.find(examQuery);
        const examIds = exams.map(e => e._id);
        
        let attemptsQuery = { 
            examId: { $in: examIds },
            ...(trainerId ? { trainerId } : {})
        };
        const paramDays = req.query.days;
        if (paramDays && paramDays !== 'all') {
            const d = parseInt(paramDays) || 7;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - d);
            attemptsQuery.createdAt = { $gte: cutoff };
        }
        const attempts = await StudentAttempt.find(attemptsQuery);

        const totalAttempts = attempts.length;
        const totalPassed = attempts.filter(a => a.result === 'pass').length;
        const avgScore = totalAttempts > 0 ? (attempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts).toFixed(2) : 0;
        const passRate = totalAttempts > 0 ? ((totalPassed / totalAttempts) * 100).toFixed(2) : 0;

        let trainerFilter = { role: 'trainer' };
        if (collegeId) {
            trainerFilter.$or = [{ collegeId }, { assignedColleges: collegeId }];
        } else if (isRegionalRole) {
            trainerFilter.$or = [
                { collegeId: { $in: collegesList } },
                { assignedColleges: { $in: collegesList } }
            ];
        }
        
        const trainers = await User.find(trainerFilter).select('username firstName lastName phone');

        const trainerStats = await Promise.all(trainers.map(async (t) => {
            const tAttempts = attempts.filter(a => a.trainerId?.toString() === t._id.toString());
            const tPassed = tAttempts.filter(a => a.result === 'pass').length;
            const uniqueStudents = new Set(tAttempts.map(a => a.studentDetails?.rollNumber).filter(Boolean)).size;
            return {
                trainerId: t._id,
                name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.username || t.phone,
                totalStudents: uniqueStudents || tAttempts.length,
                totalAttempts: tAttempts.length,
                passRate: tAttempts.length > 0 ? ((tPassed / tAttempts.length) * 100).toFixed(2) : 0,
                avgScore: tAttempts.length > 0 ? (tAttempts.reduce((acc, a) => acc + a.percentage, 0) / tAttempts.length).toFixed(2) : 0
            };
        }));

        let courses = [];
        if (collegeId) {
            const createdCourses = await Course.find({ collegeId });
            const mappedMappings = await CollegeCourseMap.find({ collegeId }).populate('courseId');
            const mappedCourses = mappedMappings.map(m => m.courseId).filter(Boolean);
            const combined = [...createdCourses, ...mappedCourses];
            const seen = new Set();
            courses = combined.filter(c => {
                const idStr = c._id.toString();
                if (seen.has(idStr)) return false;
                seen.add(idStr);
                return true;
            });
        } else {
            courses = await Course.find({});
        }
        const courseStats = await Promise.all(courses.map(async (c) => {
            const cExams = exams.filter(e => e.courseId?.toString() === c._id.toString());
            const cExamIds = cExams.map(e => e._id.toString());
            const cAttempts = attempts.filter(a => cExamIds.includes(a.examId?.toString()));
            const cPassed = cAttempts.filter(a => a.result === 'pass').length;
            const uniqueStudents = new Set(cAttempts.map(a => a.studentDetails?.rollNumber).filter(Boolean)).size;
            return {
                courseId: c._id,
                name: c.name,
                code: c.code,
                totalStudents: uniqueStudents || cAttempts.length,
                totalAttempts: cAttempts.length,
                passRate: cAttempts.length > 0 ? ((cPassed / cAttempts.length) * 100).toFixed(2) : 0,
                avgScore: cAttempts.length > 0 ? (cAttempts.reduce((acc, a) => acc + a.percentage, 0) / cAttempts.length).toFixed(2) : 0
            };
        }));

        const examStats = exams.map(e => {
            const eAttempts = attempts.filter(a => a.examId?.toString() === e._id.toString());
            const ePassed = eAttempts.filter(a => a.result === 'pass').length;
            const uniqueStudents = new Set(eAttempts.map(a => a.studentDetails?.rollNumber).filter(Boolean)).size;
            return {
                id: e._id, examId: e._id, title: e.title, 
                totalStudents: uniqueStudents || eAttempts.length,
                totalAttempts: eAttempts.length,
                passRate: eAttempts.length > 0 ? ((ePassed / eAttempts.length) * 100).toFixed(2) : 0,
                avgScore: eAttempts.length > 0 ? (eAttempts.reduce((acc, a) => acc + a.percentage, 0) / eAttempts.length).toFixed(2) : 0
            };
        });

        const paramDaysTimeline = req.query.days;
        const days = paramDaysTimeline === 'all' ? 30 : (parseInt(paramDaysTimeline) || 7);
        const timeline = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(); date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayAttempts = attempts.filter(a => { const d = new Date(a.createdAt); return d.getDate() === date.getDate() && d.getMonth() === date.getMonth(); });
            timeline.push({ name: dateStr, attempts: dayAttempts.length, avg: dayAttempts.length > 0 ? (dayAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / dayAttempts.length).toFixed(1) : 0 });
        }

        const distribution = [
            { range: '0-20%', count: attempts.filter(a => a.percentage <= 20).length },
            { range: '21-40%', count: attempts.filter(a => a.percentage > 20 && a.percentage <= 40).length },
            { range: '41-60%', count: attempts.filter(a => a.percentage > 40 && a.percentage <= 60).length },
            { range: '61-80%', count: attempts.filter(a => a.percentage > 60 && a.percentage <= 80).length },
            { range: '81-100%', count: attempts.filter(a => a.percentage > 80).length }
        ];

        res.json({ success: true, data: { summary: { totalExams: exams.length, totalAttempts, avgScore, passRate }, trainers: trainerStats, courses: courseStats, exams: examStats, timeline, distribution } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== Trainer Analytics ==========
exports.getTrainerAnalytics = async (req, res) => {
    try {
        const trainerId = req.user._id;
        const paramDaysTrainer = req.query.days;
        const collegeId = req.query.collegeId;
        let query = { trainerId };
        
        if (collegeId) {
            const exams = await Exam.find({ collegeId }).select('_id');
            const examIds = exams.map(e => e._id);
            query.examId = { $in: examIds };
        }
        
        if (paramDaysTrainer && paramDaysTrainer !== 'all') {
            const d = parseInt(paramDaysTrainer) || 7;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - d);
            query.createdAt = { $gte: cutoff };
        }
        const attempts = await StudentAttempt.find(query);

        const totalAttempts = attempts.length;
        const totalPassed = attempts.filter(a => a.result === 'pass').length;
        const avgScore = totalAttempts > 0 ? (attempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts).toFixed(2) : 0;
        const passRate = totalAttempts > 0 ? ((totalPassed / totalAttempts) * 100).toFixed(2) : 0;

        const timelineDays = paramDaysTrainer === 'all' ? 30 : (parseInt(paramDaysTrainer) || 7);
        const timeline = [];
        for (let i = timelineDays - 1; i >= 0; i--) {
            const date = new Date(); date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayAttempts = attempts.filter(a => { const d = new Date(a.createdAt); return d.getDate() === date.getDate() && d.getMonth() === date.getMonth(); });
            timeline.push({ name: dateStr, attempts: dayAttempts.length, avg: dayAttempts.length > 0 ? (dayAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / dayAttempts.length).toFixed(1) : 0 });
        }

        const distribution = [
            { range: '0-20%', count: attempts.filter(a => a.percentage <= 20).length },
            { range: '21-40%', count: attempts.filter(a => a.percentage > 20 && a.percentage <= 40).length },
            { range: '41-60%', count: attempts.filter(a => a.percentage > 40 && a.percentage <= 60).length },
            { range: '61-80%', count: attempts.filter(a => a.percentage > 60 && a.percentage <= 80).length },
            { range: '81-100%', count: attempts.filter(a => a.percentage > 80).length }
        ];

        const examStats = {};
        attempts.forEach(a => {
            const key = a.examId?.toString();
            if (!key) return;
            if (!examStats[key]) examStats[key] = { total: 0, passed: 0, score: 0 };
            examStats[key].total++;
            if (a.result === 'pass') examStats[key].passed++;
            examStats[key].score += a.percentage;
        });

        const formattedExamStats = await Promise.all(Object.keys(examStats).map(async (id) => {
            const exam = await Exam.findById(id).select('title');
            const stats = examStats[id];
            // Since exam is distinct, total students = attendees for that exam
            return {
                id,
                title: exam?.title || 'Unknown Exam',
                totalStudents: stats.total,
                passRate: ((stats.passed / stats.total) * 100).toFixed(2),
                avgScore: (stats.score / stats.total).toFixed(2)
            };
        }));

        res.json({ success: true, data: { summary: { totalAttempts, avgScore, passRate }, exams: formattedExamStats, timeline, distribution } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== Master Export — Multi-Sheet Excel ==========
exports.exportMasterSheet = async (req, res) => {
    try {
        const { type, id } = req.query;

        if (type === 'training_logs') {
            let filter = {};
            let collegeName = 'Overall Platform';
            
            // Check roles and restrict/filter
            const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
            const collegesList = isRegionalRole ? [
                ...(req.user.collegeId ? [req.user.collegeId] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
            ].map(id => id.toString()) : [];

            if (req.user.role === 'college_admin') {
                filter.collegeId = req.user.collegeId;
                const coll = await College.findById(req.user.collegeId);
                if (coll) {
                    collegeName = coll.name;
                }
            } else if (['super_admin', 'ops_admin', 'ast_ops_admin'].includes(req.user.role)) {
                const targetCollegeId = req.query.collegeId;
                if (targetCollegeId && targetCollegeId !== 'all') {
                    filter.collegeId = targetCollegeId;
                    const coll = await College.findById(targetCollegeId);
                    if (coll) {
                        collegeName = coll.name;
                    }
                }
            } else if (isRegionalRole) {
                const targetCollegeId = req.query.collegeId;
                if (targetCollegeId && targetCollegeId !== 'all') {
                    if (collegesList.includes(targetCollegeId.toString())) {
                        filter.collegeId = targetCollegeId;
                        const coll = await College.findById(targetCollegeId);
                        if (coll) {
                            collegeName = coll.name;
                        }
                    } else {
                        return res.status(403).json({ success: false, error: 'Unauthorized to view this college context' });
                    }
                } else {
                    filter.collegeId = { $in: collegesList };
                }
            } else if (req.user.role === 'trainer') {
                filter.trainerId = req.user._id;
            }

            // Optional Trainer Filter for Admins
            if (req.user.role !== 'trainer') {
                const { trainerId } = req.query;
                if (trainerId && trainerId !== 'all') {
                    filter.trainerId = trainerId;
                }
            }

            // Optional College and Course Filters (for both admins and trainers)
            const { collegeId, courseId } = req.query;
            if (collegeId && collegeId !== 'all') {
                filter.collegeId = collegeId;
                const coll = await College.findById(collegeId);
                if (coll) {
                    collegeName = coll.name;
                }
            }
            if (courseId && courseId !== 'all') {
                filter.courseId = courseId;
            }

            const sessions = await AttendanceSession.find(filter)
                .populate('trainerId', 'username firstName lastName phone')
                .populate('collegeId', 'name')
                .populate('courseId', 'name code')
                .populate('batchId', 'batchName department startDate')
                .sort({ date: -1, createdAt: -1 });

            // Group sessions by day, trainer, college, and course to format like TrainingLogs
            const grouped = {};
            sessions.forEach(sess => {
                const dateKey = new Date(sess.date).toISOString().split('T')[0];
                const trainerKey = sess.trainerId?._id?.toString() || 'unknown';
                const collegeKey = sess.collegeId?._id?.toString() || 'unknown';
                const courseKey = sess.courseId?._id?.toString() || 'unknown';
                const key = `${dateKey}_${trainerKey}_${collegeKey}_${courseKey}`;

                if (!grouped[key]) {
                    grouped[key] = {
                        _id: sess._id,
                        trainerId: sess.trainerId,
                        collegeId: sess.collegeId,
                        courseId: sess.courseId,
                        logDate: sess.date,
                        startDate: sess.batchId?.startDate || sess.date,
                        batches: []
                    };
                }

                grouped[key].batches.push({
                    batchName: sess.batchId?.batchName || 'Unknown Batch',
                    timeSlot: sess.period || 'Hour 1',
                    department: sess.batchId?.department || 'GEN',
                    moduleTaught: sess.module || '—',
                    actualCount: sess.records?.length || 0,
                    presentCount: sess.records?.filter(r => r.status === 'present' || r.status === 'late').length || 0,
                    topicsCovered: sess.topic
                });
            });

            const logs = Object.values(grouped);

            // ========== Build Training Logs Workbook ==========
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Ethnotech Academy';
            workbook.created = new Date();

            // --- SHEET 1: Summary ---
            const summarySheet = workbook.addWorksheet('📊 Summary');
            summarySheet.columns = [
                { header: 'Metric', key: 'metric', width: 30 },
                { header: 'Value', key: 'value', width: 25 }
            ];
            styleHeader(summarySheet);

            const totalLogs = logs.length;
            let totalBatches = 0;
            let totalPresent = 0;
            let totalActual = 0;
            const uniqueCourses = new Set();
            const uniqueTrainers = new Set();

            logs.forEach(log => {
                if (log.courseId) uniqueCourses.add(log.courseId._id?.toString() || log.courseId.toString());
                if (log.trainerId) uniqueTrainers.add(log.trainerId._id?.toString() || log.trainerId.toString());
                
                if (Array.isArray(log.batches)) {
                    totalBatches += log.batches.length;
                    log.batches.forEach(b => {
                        totalPresent += (b.presentCount || 0);
                        totalActual += (b.actualCount || 0);
                    });
                }
            });

            const avgAttendance = totalActual > 0 ? ((totalPresent / totalActual) * 100).toFixed(2) : 0;

            const summaryData = [
                ['Report Scope', collegeName],
                ['Generated On', new Date().toLocaleString()],
                ['Total Daily Logs', totalLogs],
                ['Total Batches Logged', totalBatches],
                ['Total Enrolled (Actual)', totalActual],
                ['Total Attended (Present)', totalPresent],
                ['Average Attendance Rate', `${avgAttendance}%`],
                ['Distinct Courses Handled', uniqueCourses.size],
                ['Distinct Trainers Active', uniqueTrainers.size]
            ];

            summaryData.forEach(([metric, value], i) => {
                const row = summarySheet.addRow({ metric, value });
                styleDataRow(row, i % 2 === 0);
            });

            // Group logs by courseId
            const courseLogsMap = {};
            logs.forEach(log => {
                const courseKey = log.courseId?._id?.toString() || 'unknown';
                if (!courseLogsMap[courseKey]) {
                    const courseName = log.courseId?.name || 'Unknown Course';
                    const courseCode = log.courseId?.code || '—';
                    courseLogsMap[courseKey] = {
                        name: courseName,
                        code: courseCode,
                        entries: []
                    };
                }
                courseLogsMap[courseKey].entries.push(log);
            });

            const usedSheetNames = new Set();
            // Create a separate sheet for each course
            for (const [courseId, courseGroup] of Object.entries(courseLogsMap)) {
                // Generate a valid, unique sheet name (limited to 31 characters)
                let baseName = `${courseGroup.code} ${courseGroup.name}`.replace(/[\\/*?:\[\]]/g, '').trim().substring(0, 31);
                if (!baseName) baseName = 'Course';
                let sheetName = baseName;
                let counter = 1;
                while (usedSheetNames.has(sheetName)) {
                    sheetName = `${baseName.substring(0, 31 - (counter.toString().length + 1))}_${counter}`;
                    counter++;
                }
                usedSheetNames.add(sheetName);

                const logsSheet = workbook.addWorksheet(sheetName);

                // Collect metadata first
                const uniqueTrainers = new Set();
                const uniquePhones = new Set();
                const uniqueColleges = new Set();
                const uniqueBatches = new Set();

                courseGroup.entries.forEach(log => {
                    const currentCollegeName = log.collegeId?.name || '—';
                    const trainerName = log.trainerId
                        ? (`${log.trainerId.firstName || ''} ${log.trainerId.lastName || ''}`.trim() || log.trainerId.phone || log.trainerId.username || 'System')
                        : 'System';
                    const trainerPhone = log.trainerId?.phone || '—';

                    uniqueTrainers.add(trainerName);
                    if (trainerPhone && trainerPhone !== '—') uniquePhones.add(trainerPhone);
                    uniqueColleges.add(currentCollegeName);

                    if (Array.isArray(log.batches)) {
                        log.batches.forEach(b => {
                            if (b.batchName) uniqueBatches.add(b.batchName);
                        });
                    }
                });

                const trainersStr = Array.from(uniqueTrainers).join(', ') || '—';
                const phonesStr = Array.from(uniquePhones).join(', ') || '—';
                const collegesStr = Array.from(uniqueColleges).join(', ') || '—';
                const batchesStr = Array.from(uniqueBatches).join(', ') || '—';

                // Row 1: Title Row
                const titleRow = logsSheet.addRow([`Training Logs Report — ${courseGroup.name} (${courseGroup.code})`]);
                titleRow.font = { bold: true, size: 14, color: { argb: 'FF004AAD' } };
                logsSheet.mergeCells(1, 1, 1, 8);
                titleRow.height = 28;

                // Row 2: College Row
                const collegeRow = logsSheet.addRow([`College: ${collegesStr}`]);
                collegeRow.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
                logsSheet.mergeCells(2, 1, 2, 8);
                collegeRow.height = 20;

                // Row 3: Trainer Row
                const trainerRow = logsSheet.addRow([`Trainer: ${trainersStr} ${phonesStr !== '—' ? `(Phone: ${phonesStr})` : ''}`]);
                trainerRow.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
                logsSheet.mergeCells(3, 1, 3, 8);
                trainerRow.height = 20;

                // Row 4: Batch Row
                const batchRow = logsSheet.addRow([`Batch: ${batchesStr}`]);
                batchRow.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
                logsSheet.mergeCells(4, 1, 4, 8);
                batchRow.height = 20;

                // Row 5: Spacer
                logsSheet.addRow([]);

                // Row 6: Table Headers
                const headers = ['Log Date', 'Module', 'Topic Covered', 'Time Slot', 'Department', 'Present Count', 'Actual Count', 'Attendance %'];
                const headerRow = logsSheet.addRow(headers);
                headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
                headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
                headerRow.height = 24;

                // Add borders to headers
                headerRow.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF003580' } },
                        bottom: { style: 'thin', color: { argb: 'FF003580' } },
                        left: { style: 'thin', color: { argb: 'FF003580' } },
                        right: { style: 'thin', color: { argb: 'FF003580' } }
                    };
                });

                // Add data rows starting at Row 7
                let rowIndex = 0;
                courseGroup.entries.forEach((log) => {
                    const logDateStr = log.logDate ? new Date(log.logDate).toLocaleDateString('en-IN') : '—';

                    if (Array.isArray(log.batches)) {
                        log.batches.forEach(b => {
                            const attRate = b.actualCount > 0 ? ((b.presentCount / b.actualCount) * 100).toFixed(2) : 0;
                            const row = logsSheet.addRow([
                                logDateStr,
                                b.moduleTaught || '—',
                                b.topicsCovered || '—',
                                b.timeSlot || '—',
                                b.department || '—',
                                b.presentCount || 0,
                                b.actualCount || 0,
                                `${attRate}%`
                            ]);
                            
                            styleDataRow(row, rowIndex % 2 === 0);

                            // Align cells
                            row.eachCell((cell, colNumber) => {
                                cell.alignment = {
                                    vertical: 'middle',
                                    horizontal: colNumber === 3 ? 'left' : 'center'
                                };
                            });
                            
                            // Color the attendanceRate cell (Column 8)
                            const rateCell = row.getCell(8);
                            if (parseFloat(attRate) >= 85) {
                                rateCell.font = { bold: true, color: { argb: 'FF166534' } };
                                rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                            } else if (parseFloat(attRate) < 70) {
                                rateCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                                rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                            }
                            
                            rowIndex++;
                        });
                    }
                });

                // Set column widths
                logsSheet.getColumn(1).width = 15; // Log Date
                logsSheet.getColumn(2).width = 15; // Module
                logsSheet.getColumn(3).width = 40; // Topic Covered
                logsSheet.getColumn(4).width = 18; // Time Slot
                logsSheet.getColumn(5).width = 15; // Department
                logsSheet.getColumn(6).width = 15; // Present Count
                logsSheet.getColumn(7).width = 15; // Actual Count
                logsSheet.getColumn(8).width = 16; // Attendance %
            }

            // Set headers and response
            const reportTitle = `${collegeName.replace(/\s+/g, '_')}_Training_Logs_Report`;
            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${reportTitle}.xlsx"`);
            res.send(buffer);
            return;
        }

        let collegeId = null;
        let reportTitle = 'Master_Analytics_Report';
        let attempts = [];
        let courses = [];
        let exams = [];

        // --- Resolve scope ---

        const isRegionalRole = ['regional_manager', 'asst_rm'].includes(req.user.role);
        const collegesList = isRegionalRole ? [
            ...(req.user.collegeId ? [req.user.collegeId] : []),
            ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges : [])
        ].map(id => id.toString()) : [];

        if (type === 'college' || (!type && req.user.role === 'college_admin')) {
            const cid = id || req.user.collegeId?.toString();
            
            if (cid === 'all') {
                const isAuthorizedAll = ['super_admin', 'ops_admin', 'ast_ops_admin'].includes(req.user.role);
                if (!isAuthorizedAll && !isRegionalRole) {
                    return res.status(403).json({ success: false, error: 'Not authorized to export all colleges' });
                }

                const collegesQuery = isRegionalRole ? { _id: { $in: collegesList } } : {};
                const colleges = await College.find(collegesQuery).sort({ name: 1 });
                const workbook = new ExcelJS.Workbook();
                workbook.creator = 'Ethnotech Academy';
                workbook.created = new Date();

                // First sheet: Overview
                const summarySheet = workbook.addWorksheet('📊 Overview');
                summarySheet.views = [{ showGridLines: true }];
                summarySheet.columns = [
                    { header: 'College Name', key: 'name', width: 40 },
                    { header: 'College Code', key: 'code', width: 15 },
                    { header: 'Location / Address', key: 'address', width: 45 },
                    { header: 'Contact Email', key: 'email', width: 25 },
                    { header: 'Contact Phone', key: 'phone', width: 18 },
                    { header: 'Status', key: 'status', width: 12 }
                ];
                
                // Style Overview Header
                const overviewHeader = summarySheet.getRow(1);
                overviewHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                overviewHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
                overviewHeader.alignment = { vertical: 'middle', horizontal: 'left' };
                overviewHeader.height = 24;

                colleges.forEach((coll, index) => {
                    const row = summarySheet.addRow({
                        name: coll.name,
                        code: coll.code,
                        address: coll.address || '—',
                        email: coll.contactEmail || '—',
                        phone: coll.contactPhone || '—',
                        status: (coll.status || 'active').toUpperCase()
                    });
                    
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };
                    row.alignment = { vertical: 'middle' };
                    row.font = { name: 'Inter', size: 10 };
                    
                    const statusCell = row.getCell('status');
                    if (coll.status === 'active') {
                        statusCell.font = { bold: true, color: { argb: 'FF166534', name: 'Inter' }, size: 10 };
                        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                    } else {
                        statusCell.font = { bold: true, color: { argb: 'FF991B1B', name: 'Inter' }, size: 10 };
                        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    }
                });

                // Loop through each college to create its sheet
                const usedSheetNames = new Set();
                for (const college of colleges) {
                    let baseName = `${college.code} ${college.name}`.replace(/[\\/*?:\[\]]/g, '').trim().substring(0, 31);
                    if (!baseName) baseName = 'College';
                    let sheetName = baseName;
                    let counter = 1;
                    while (usedSheetNames.has(sheetName)) {
                        sheetName = `${baseName.substring(0, 31 - (counter.toString().length + 1))}_${counter}`;
                        counter++;
                    }
                    usedSheetNames.add(sheetName);

                    const sheet = workbook.addWorksheet(sheetName);
                    sheet.views = [{ showGridLines: true }];

                    // Title row
                    sheet.mergeCells('A1:H1');
                    const titleRow = sheet.getRow(1);
                    titleRow.getCell(1).value = `🏫 ${college.name} (Code: ${college.code})`;
                    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
                    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
                    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                    titleRow.height = 32;

                    // Meta Rows
                    const metaFields = [
                        ['Campus Address / Location', college.address || '—'],
                        ['Contact Email', college.contactEmail || '—'],
                        ['Contact Phone', college.contactPhone || '—'],
                        ['Current Status', (college.status || 'active').toUpperCase()]
                    ];
                    
                    metaFields.forEach((item, mIdx) => {
                        const rowIdx = mIdx + 2;
                        sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
                        sheet.mergeCells(`C${rowIdx}:H${rowIdx}`);
                        
                        const cellKey = sheet.getCell(`A${rowIdx}`);
                        cellKey.value = item[0];
                        cellKey.font = { bold: true, size: 10, color: { argb: 'FF475569' }, name: 'Inter' };
                        cellKey.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                        cellKey.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

                        const cellVal = sheet.getCell(`C${rowIdx}`);
                        cellVal.value = item[1];
                        cellVal.font = { size: 10, name: 'Inter' };
                        cellVal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                        
                        if (item[0] === 'Current Status') {
                            if (item[1] === 'ACTIVE') {
                                cellVal.font = { bold: true, color: { argb: 'FF166534', name: 'Inter' }, size: 10 };
                                cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                            } else {
                                cellVal.font = { bold: true, color: { argb: 'FF991B1B', name: 'Inter' }, size: 10 };
                                cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                            }
                        }
                        sheet.getRow(rowIdx).height = 20;
                    });

                    // Spacer row
                    sheet.getRow(6).height = 12;

                    // Course details header
                    const mappingHeaders = [
                        'S.No', 'Course Name', 'Course Code', 'Mapped Trainer(s)', 'Trainer Phone/Email', 'Classroom Location', 'Batches Count', 'Active Roster Size'
                    ];
                    const mapHeaderRow = sheet.getRow(7);
                    mappingHeaders.forEach((hdr, hIdx) => {
                        const cell = mapHeaderRow.getCell(hIdx + 1);
                        cell.value = hdr;
                        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FF0F172A' } },
                            bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
                            left: { style: 'thin', color: { argb: 'FF0F172A' } },
                            right: { style: 'thin', color: { argb: 'FF0F172A' } }
                        };
                    });
                    mapHeaderRow.height = 24;

                    const createdCourses = await Course.find({ collegeId: college._id });
                    const mappedMappings = await CollegeCourseMap.find({ collegeId: college._id }).populate('courseId');
                    const mappedCourses = mappedMappings.map(m => m.courseId).filter(Boolean);
                    const combined = [...createdCourses, ...mappedCourses];
                    const seenC = new Set();
                    const collegeCourses = combined.filter(c => {
                        const idStr = c._id.toString();
                        if (seenC.has(idStr)) return false;
                        seenC.add(idStr);
                        return true;
                    });

                    let sNo = 1;
                    let dataRowIdx = 8;
                    
                    for (const course of collegeCourses) {
                        const trainerMaps = await TrainerCourseMap.find({
                            collegeId: college._id,
                            courseId: course._id,
                            status: 'active'
                        }).populate('trainerId');

                        if (trainerMaps.length > 0) {
                            for (const tMap of trainerMaps) {
                                const trainer = tMap.trainerId;
                                const trainerName = trainer 
                                    ? (`${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() || trainer.username || trainer.phone)
                                    : 'System / Unassigned';
                                const trainerContact = trainer 
                                    ? (trainer.phone || trainer.email || '—') 
                                    : '—';
                                const classroomLoc = tMap.classroomLocation || '—';

                                const batches = await Batch.find({
                                    collegeId: college._id,
                                    courseId: course._id,
                                    trainerId: trainer?._id
                                });
                                const batchesCount = batches.length;
                                const rosterSize = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);

                                const row = sheet.getRow(dataRowIdx);
                                row.values = [
                                    sNo,
                                    course.name,
                                    course.code,
                                    trainerName,
                                    trainerContact,
                                    classroomLoc,
                                    batchesCount,
                                    rosterSize
                                ];

                                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sNo % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };

                                row.eachCell((cell, colIdx) => {
                                    cell.alignment = {
                                        vertical: 'middle',
                                        horizontal: (colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 6) ? 'left' : 'center'
                                    };
                                    cell.font = { name: 'Inter', size: 10 };
                                    cell.border = {
                                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                                    };
                                });
                                
                                row.height = 22;
                                dataRowIdx++;
                                sNo++;
                            }
                        } else {
                            const batches = await Batch.find({
                                collegeId: college._id,
                                courseId: course._id
                            });
                            const batchesCount = batches.length;
                            const rosterSize = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);

                            const row = sheet.getRow(dataRowIdx);
                            row.values = [
                                sNo,
                                course.name,
                                course.code,
                                'Not Assigned',
                                '—',
                                '—',
                                batchesCount,
                                rosterSize
                            ];

                            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sNo % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };

                            const trainerCell = row.getCell(4);
                            trainerCell.font = { italic: true, color: { argb: 'FF94A3B8', name: 'Inter' }, size: 10 };

                            row.eachCell((cell, colIdx) => {
                                cell.alignment = {
                                    vertical: 'middle',
                                    horizontal: (colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 6) ? 'left' : 'center'
                                };
                                if (colIdx !== 4) {
                                    cell.font = { name: 'Inter', size: 10 };
                                }
                                cell.border = {
                                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                                };
                            });
                            
                            row.height = 22;
                            dataRowIdx++;
                            sNo++;
                        }
                    }

                    sheet.getColumn(1).width = 8;
                    sheet.getColumn(2).width = 30;
                    sheet.getColumn(3).width = 15;
                    sheet.getColumn(4).width = 25;
                    sheet.getColumn(5).width = 25;
                    sheet.getColumn(6).width = 25;
                    sheet.getColumn(7).width = 15;
                    sheet.getColumn(8).width = 18;
                }

                const buffer = await workbook.xlsx.writeBuffer();
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="All_Colleges_Profile_Report.xlsx"');
                res.send(buffer);
                return;
            }

            if (isRegionalRole && !collegesList.includes(cid.toString())) {
                return res.status(403).json({ success: false, error: 'Unauthorized to view this college context' });
            }

            const college = await College.findById(cid);
            reportTitle = `${college?.name || 'College'}_Report`;
            collegeId = cid;
            exams = await Exam.find({ collegeId: cid }).populate('courseId', 'name code');
            const examIds = exams.map(e => e._id);
            attempts = await StudentAttempt.find({ examId: { $in: examIds } })
                .populate({ path: 'examId', select: 'title department courseId', populate: { path: 'courseId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            const createdCourses = await Course.find({ collegeId: cid });
            const mappedMappings = await CollegeCourseMap.find({ collegeId: cid }).populate('courseId');
            const mappedCourses = mappedMappings.map(m => m.courseId).filter(Boolean);
            const combined = [...createdCourses, ...mappedCourses];
            const seen = new Set();
            courses = combined.filter(c => {
                const idStr = c._id.toString();
                if (seen.has(idStr)) return false;
                seen.add(idStr);
                return true;
            });

        } else if (type === 'college_profile') {
            const cid = id || req.user.collegeId?.toString();
            if (!cid) {
                return res.status(400).json({ success: false, error: 'College ID is required' });
            }
            if (req.user.role === 'college_admin' && req.user.collegeId?.toString() !== cid) {
                return res.status(403).json({ success: false, error: 'Not authorized for this college' });
            }
            if (isRegionalRole && !collegesList.includes(cid.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized for this college' });
            }

            const college = await College.findById(cid);
            if (!college) {
                return res.status(404).json({ success: false, error: 'College not found' });
            }

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Ethnotech Academy';
            workbook.created = new Date();

            // ==================== SHEET 1: OVERVIEW ====================
            const overviewSheet = workbook.addWorksheet('📊 Overview');
            overviewSheet.views = [{ showGridLines: true }];

            // Title block
            overviewSheet.mergeCells('A1:F1');
            const titleRow = overviewSheet.getRow(1);
            titleRow.getCell(1).value = `🏫 Institutional Profile — ${college.name}`;
            titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
            titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            titleRow.height = 36;

            const createdCourses = await Course.find({ collegeId: college._id });
            const mappedMappings = await CollegeCourseMap.find({ collegeId: college._id }).populate('courseId');
            const mappedCourses = mappedMappings.map(m => m.courseId).filter(Boolean);
            const combined = [...createdCourses, ...mappedCourses];
            const seenC = new Set();
            const collegeCourses = combined.filter(c => {
                const idStr = c._id.toString();
                if (seenC.has(idStr)) return false;
                seenC.add(idStr);
                return true;
            });

            const collegeBatches = await Batch.find({ collegeId: college._id });
            const collegeStudentsCount = await Student.countDocuments({ collegeId: college._id, status: 'active' });

            const trainerMaps = await TrainerCourseMap.find({ collegeId: college._id, status: 'active' });
            const activeTrainersCount = new Set(trainerMaps.map(m => m.trainerId.toString())).size;

            const profileFields = [
                ['College Name', college.name],
                ['College Code', college.code],
                ['Campus Address', college.address || '—'],
                ['Contact Email', college.contactEmail || '—'],
                ['Contact Phone', college.contactPhone || '—'],
                ['Status', (college.status || 'active').toUpperCase()],
                ['', ''], // Spacer
                ['Total Mapped Courses', collegeCourses.length],
                ['Total Assigned Trainers', activeTrainersCount],
                ['Total Active Batches', collegeBatches.length],
                ['Total Active Students', collegeStudentsCount]
            ];

            profileFields.forEach((item, idx) => {
                const rIdx = idx + 3;
                const row = overviewSheet.getRow(rIdx);
                row.height = 20;

                if (item[0] === '') return; // Skip spacer

                overviewSheet.mergeCells(`A${rIdx}:B${rIdx}`);
                overviewSheet.mergeCells(`C${rIdx}:F${rIdx}`);

                const keyCell = overviewSheet.getCell(`A${rIdx}`);
                keyCell.value = item[0];
                keyCell.font = { bold: true, size: 10, color: { argb: 'FF475569' }, name: 'Inter' };
                keyCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

                const valCell = overviewSheet.getCell(`C${rIdx}`);
                valCell.value = item[1];
                valCell.font = { size: 10, name: 'Inter' };
                valCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

                if (item[0] === 'Status') {
                    if (item[1] === 'ACTIVE') {
                        valCell.font = { bold: true, color: { argb: 'FF166534', name: 'Inter' }, size: 10 };
                        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                    } else {
                        valCell.font = { bold: true, color: { argb: 'FF991B1B', name: 'Inter' }, size: 10 };
                        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    }
                }

                if (idx >= 7) {
                    keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
                    keyCell.font = { bold: true, size: 10, color: { argb: 'FF004AAD', name: 'Inter' } };
                    valCell.font = { bold: true, size: 10, color: { argb: 'FF0F172A', name: 'Inter' } };
                }
            });

            overviewSheet.getColumn(1).width = 15;
            overviewSheet.getColumn(2).width = 15;
            overviewSheet.getColumn(3).width = 25;
            overviewSheet.getColumn(4).width = 15;
            overviewSheet.getColumn(5).width = 15;
            overviewSheet.getColumn(6).width = 15;

            // ==================== SHEET 2: COURSES MAPPING ====================
            const coursesSheet = workbook.addWorksheet('📚 Curricula Map');
            coursesSheet.views = [{ showGridLines: true }];

            coursesSheet.mergeCells('A1:H1');
            const cTitleRow = coursesSheet.getRow(1);
            cTitleRow.getCell(1).value = `📚 Mapped Courses & Assignments — ${college.name}`;
            cTitleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
            cTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
            cTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            cTitleRow.height = 30;

            const mapHeaders = [
                'S.No', 'Course Name', 'Course Code', 'Mapped Trainer(s)', 'Trainer Phone/Email', 'Classroom Location', 'Batches Count', 'Active Roster Size'
            ];
            const mapHeaderRow = coursesSheet.getRow(3);
            mapHeaders.forEach((hdr, hIdx) => {
                const cell = mapHeaderRow.getCell(hIdx + 1);
                cell.value = hdr;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF0F172A' } },
                    bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
                    left: { style: 'thin', color: { argb: 'FF0F172A' } },
                    right: { style: 'thin', color: { argb: 'FF0F172A' } }
                };
            });
            mapHeaderRow.height = 24;

            let cSNo = 1;
            let cDataRowIdx = 4;

            for (const course of collegeCourses) {
                const trainerMaps = await TrainerCourseMap.find({
                    collegeId: college._id,
                    courseId: course._id,
                    status: 'active'
                }).populate('trainerId');

                if (trainerMaps.length > 0) {
                    for (const tMap of trainerMaps) {
                        const trainer = tMap.trainerId;
                        const trainerName = trainer 
                            ? (`${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() || trainer.username || trainer.phone)
                            : 'System / Unassigned';
                        const trainerContact = trainer 
                            ? (trainer.phone || trainer.email || '—') 
                            : '—';
                        const classroomLoc = tMap.classroomLocation || '—';

                        const batches = await Batch.find({
                            collegeId: college._id,
                            courseId: course._id,
                            trainerId: trainer?._id
                        });
                        const batchesCount = batches.length;
                        const rosterSize = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);

                        const row = coursesSheet.getRow(cDataRowIdx);
                        row.values = [
                            cSNo,
                            course.name,
                            course.code,
                            trainerName,
                            trainerContact,
                            classroomLoc,
                            batchesCount,
                            rosterSize
                        ];

                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cSNo % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };

                        row.eachCell((cell, colIdx) => {
                            cell.alignment = {
                                vertical: 'middle',
                                horizontal: (colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 6) ? 'left' : 'center'
                            };
                            cell.font = { name: 'Inter', size: 10 };
                            cell.border = {
                                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                            };
                        });
                        
                        row.height = 22;
                        cDataRowIdx++;
                        cSNo++;
                    }
                } else {
                    const batches = await Batch.find({
                        collegeId: college._id,
                        courseId: course._id
                    });
                    const batchesCount = batches.length;
                    const rosterSize = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);

                    const row = coursesSheet.getRow(cDataRowIdx);
                    row.values = [
                        cSNo,
                        course.name,
                        course.code,
                        'Not Assigned',
                        '—',
                        '—',
                        batchesCount,
                        rosterSize
                    ];

                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cSNo % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };

                    const trainerCell = row.getCell(4);
                    trainerCell.font = { italic: true, color: { argb: 'FF94A3B8', name: 'Inter' }, size: 10 };

                    row.eachCell((cell, colIdx) => {
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: (colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 6) ? 'left' : 'center'
                        };
                        if (colIdx !== 4) {
                            cell.font = { name: 'Inter', size: 10 };
                        }
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                        };
                    });
                    
                    row.height = 22;
                    cDataRowIdx++;
                    cSNo++;
                }
            }

            coursesSheet.getColumn(1).width = 8;
            coursesSheet.getColumn(2).width = 30;
            coursesSheet.getColumn(3).width = 15;
            coursesSheet.getColumn(4).width = 25;
            coursesSheet.getColumn(5).width = 25;
            coursesSheet.getColumn(6).width = 25;
            coursesSheet.getColumn(7).width = 15;
            coursesSheet.getColumn(8).width = 18;

            // ==================== BATCH SHEETS ====================
            const usedSheetNames = new Set();
            usedSheetNames.add('📊 Overview');
            usedSheetNames.add('📚 Curricula Map');

            for (const batch of collegeBatches) {
                const students = await Student.find({ batchId: batch._id, status: 'active' }).sort({ name: 1 });
                const sessions = await AttendanceSession.find({ batchId: batch._id })
                    .populate('trainerId', 'firstName lastName')
                    .sort({ date: 1, createdAt: 1 });

                // 1. Tracker Sheet for Batch
                let baseTrackerName = `Tracker_${batch.batchName}`.replace(/[\\/*?:\[\]]/g, '').trim().substring(0, 31);
                let trackerSheetName = baseTrackerName;
                let tCounter = 1;
                while (usedSheetNames.has(trackerSheetName)) {
                    trackerSheetName = `${baseTrackerName.substring(0, 31 - (tCounter.toString().length + 1))}_${tCounter}`;
                    tCounter++;
                }
                usedSheetNames.add(trackerSheetName);

                const trackerSheet = workbook.addWorksheet(trackerSheetName);
                trackerSheet.views = [{ showGridLines: true }];

                // Title Block
                trackerSheet.mergeCells('A1:G1');
                const trTitleRow = trackerSheet.getRow(1);
                trTitleRow.getCell(1).value = `📋 Session Progress Log — ${batch.batchName} (${batch.department})`;
                trTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
                trTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
                trTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                trTitleRow.height = 30;

                const trHeaders = ['S.No', 'Date', 'Time Slot', 'Module', 'Topic Covered', 'Trainer Name', 'Attendance %'];
                const trHeaderRow = trackerSheet.getRow(3);
                trHeaders.forEach((hdr, hIdx) => {
                    const cell = trHeaderRow.getCell(hIdx + 1);
                    cell.value = hdr;
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Inter' };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF1F2937' } },
                        bottom: { style: 'thin', color: { argb: 'FF1F2937' } },
                        left: { style: 'thin', color: { argb: 'FF1F2937' } },
                        right: { style: 'thin', color: { argb: 'FF1F2937' } }
                    };
                });
                trHeaderRow.height = 22;

                sessions.forEach((sess, sIdx) => {
                    const activePresentCount = sess.records.filter(r => r.status === 'present' || r.status === 'late').length;
                    const totalRosterCount = sess.records.length || students.length || 1;
                    const rate = totalRosterCount > 0 ? ((activePresentCount / totalRosterCount) * 100).toFixed(2) : 0;
                    const trainerName = sess.trainerId 
                        ? `${sess.trainerId.firstName || ''} ${sess.trainerId.lastName || ''}`.trim()
                        : 'System';

                    const row = trackerSheet.addRow([
                        sIdx + 1,
                        sess.date ? new Date(sess.date).toLocaleDateString('en-IN') : '—',
                        sess.period || 'Hour 1',
                        sess.module || '—',
                        sess.topic || '—',
                        trainerName,
                        `${rate}%`
                    ]);
                    row.height = 20;

                    styleDataRow(row, sIdx % 2 === 0);

                    row.eachCell((cell, colIdx) => {
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: colIdx === 5 ? 'left' : 'center'
                        };
                        cell.font = { name: 'Inter', size: 9 };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                        };
                    });

                    const rateCell = row.getCell(7);
                    if (parseFloat(rate) >= 85) {
                        rateCell.font = { bold: true, color: { argb: 'FF166534', name: 'Inter' }, size: 9 };
                        rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                    } else if (parseFloat(rate) < 70) {
                        rateCell.font = { bold: true, color: { argb: 'FF991B1B', name: 'Inter' }, size: 9 };
                        rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    }
                });

                trackerSheet.getColumn(1).width = 7;
                trackerSheet.getColumn(2).width = 14;
                trackerSheet.getColumn(3).width = 15;
                trackerSheet.getColumn(4).width = 12;
                trackerSheet.getColumn(5).width = 32;
                trackerSheet.getColumn(6).width = 22;
                trackerSheet.getColumn(7).width = 15;

                // 2. Register Sheet for Batch
                let baseRegisterName = `Register_${batch.batchName}`.replace(/[\\/*?:\[\]]/g, '').trim().substring(0, 31);
                let registerSheetName = baseRegisterName;
                let rCounter = 1;
                while (usedSheetNames.has(registerSheetName)) {
                    registerSheetName = `${baseRegisterName.substring(0, 31 - (rCounter.toString().length + 1))}_${rCounter}`;
                    rCounter++;
                }
                usedSheetNames.add(registerSheetName);

                const registerSheet = workbook.addWorksheet(registerSheetName);
                registerSheet.views = [{ showGridLines: true }];

                const dateColsCount = sessions.length;
                const totalColumnsCount = 6 + dateColsCount;

                registerSheet.mergeCells(1, 1, 1, totalColumnsCount);
                const regTitleRow = registerSheet.getRow(1);
                regTitleRow.getCell(1).value = `📋 Student Attendance Register — ${batch.batchName} (${batch.department})`;
                regTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
                regTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
                regTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                regTitleRow.height = 30;

                const rHeaders = ['S.No', 'Student Name', 'USN', 'Department'];
                sessions.forEach(sess => {
                    const d = new Date(sess.date);
                    const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    rHeaders.push(formattedDate);
                });
                rHeaders.push('Total P+L', 'Total A', 'Rate %');

                const registerHeaderRow = registerSheet.getRow(3);
                rHeaders.forEach((hdr, hIdx) => {
                    const cell = registerHeaderRow.getCell(hIdx + 1);
                    cell.value = hdr;
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Inter' };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF1F2937' } },
                        bottom: { style: 'thin', color: { argb: 'FF1F2937' } },
                        left: { style: 'thin', color: { argb: 'FF1F2937' } },
                        right: { style: 'thin', color: { argb: 'FF1F2937' } }
                    };
                });
                registerHeaderRow.height = 24;

                students.forEach((student, sIdx) => {
                    const rowData = [
                        sIdx + 1,
                        student.name,
                        student.usn,
                        student.department || '—'
                    ];

                    let presentCount = 0;
                    let absentCount = 0;
                    let lateCount = 0;
                    let excusedCount = 0;

                    sessions.forEach(sess => {
                        const rec = sess.records.find(r => r.studentId.toString() === student._id.toString());
                        const status = rec ? rec.status : 'absent';
                        
                        if (status === 'present') {
                            rowData.push('P');
                            presentCount++;
                        } else if (status === 'absent') {
                            rowData.push('A');
                            absentCount++;
                        } else if (status === 'late') {
                            rowData.push('L');
                            lateCount++;
                        } else if (status === 'excused') {
                            rowData.push('E');
                            excusedCount++;
                        } else {
                            rowData.push('A');
                            absentCount++;
                        }
                    });

                    const attendedCount = presentCount + lateCount;
                    const totalSessionsCount = sessions.length;
                    const rate = totalSessionsCount > 0 ? Math.round((attendedCount / totalSessionsCount) * 100) : 100;

                    rowData.push(attendedCount);
                    rowData.push(absentCount);
                    rowData.push(`${rate}%`);

                    const row = registerSheet.addRow(rowData);
                    row.height = 20;

                    styleDataRow(row, sIdx % 2 === 0);

                    row.eachCell((cell, colIdx) => {
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: (colIdx === 2) ? 'left' : 'center'
                        };
                        cell.font = { name: 'Inter', size: 9 };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                        };

                        if (colIdx > 4 && colIdx <= 4 + totalSessionsCount) {
                            const val = cell.value;
                            if (val === 'P') cell.font = { color: { argb: 'FF166534', name: 'Inter' }, bold: true, size: 9 };
                            else if (val === 'A') cell.font = { color: { argb: 'FF991B1B', name: 'Inter' }, bold: true, size: 9 };
                            else if (val === 'L') cell.font = { color: { argb: 'FFD97706', name: 'Inter' }, bold: true, size: 9 };
                            else if (val === 'E') cell.font = { color: { argb: 'FF4B5563', name: 'Inter' }, bold: true, size: 9 };
                        }
                    });

                    const rateCellIdx = 4 + totalSessionsCount + 3;
                    const rateCell = row.getCell(rateCellIdx);
                    if (rate >= 75) {
                        rateCell.font = { bold: true, color: { argb: 'FF166534', name: 'Inter' }, size: 9 };
                        rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                    } else {
                        rateCell.font = { bold: true, color: { argb: 'FF991B1B', name: 'Inter' }, size: 9 };
                        rateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    }
                });

                registerSheet.getColumn(1).width = 6;
                registerSheet.getColumn(2).width = 24;
                registerSheet.getColumn(3).width = 16;
                registerSheet.getColumn(4).width = 12;
                
                for (let i = 0; i < dateColsCount; i++) {
                    registerSheet.getColumn(5 + i).width = 10;
                }

                registerSheet.getColumn(5 + dateColsCount).width = 12;
                registerSheet.getColumn(5 + dateColsCount + 1).width = 12;
                registerSheet.getColumn(5 + dateColsCount + 2).width = 12;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${college.code}_Full_Profile_Report.xlsx"`);
            res.send(buffer);
            return;

        } else if (type === 'course') {
            const course = await Course.findById(id);
            reportTitle = `${course?.name || 'Course'}_Report`;
            collegeId = course?.collegeId;
            exams = await Exam.find({ courseId: id }).populate('courseId', 'name code');
            const examIds = exams.map(e => e._id);
            
            let attemptsFilter = { examId: { $in: examIds } };
            if (req.user.role === 'trainer') {
                attemptsFilter.trainerId = req.user._id;
            }
            attempts = await StudentAttempt.find(attemptsFilter)
                .populate({ path: 'examId', select: 'title department courseId', populate: { path: 'courseId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            courses = course ? [course] : [];

        } else if (type === 'trainer') {
            const trainer = await User.findById(id);
            const name = `${trainer?.firstName || ''} ${trainer?.lastName || ''}`.trim() || trainer?.phone || 'Trainer';
            reportTitle = `${name}_Report`;
            attempts = await StudentAttempt.find({ trainerId: id })
                .populate({ path: 'examId', select: 'title department courseId', populate: { path: 'courseId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            // Build courses from the exam data in attempts
            const courseMap = {};
            attempts.forEach(a => { if (a.examId?.courseId) courseMap[a.examId.courseId._id] = a.examId.courseId; });
            courses = Object.values(courseMap);

        } else if (type === 'exam') {
            const exam = await Exam.findById(id)
                .populate('courseId', 'name code')
                .populate('collegeId', 'name');
            if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

            // Restrict college_admin
            if (req.user.role === 'college_admin' && exam.collegeId?.toString() !== req.user.collegeId?.toString()) {
                return res.status(403).json({ success: false, error: 'Not authorized for this college' });
            }

            const { trainerId, batchId } = req.query;
            let attemptsFilter = { examId: id };

            if (req.user.role === 'trainer') {
                attemptsFilter.trainerId = req.user._id;
            } else if (trainerId && trainerId !== 'all') {
                attemptsFilter.trainerId = trainerId;
            }

            if (batchId && batchId !== 'all') {
                const keyQuery = { examId: id };
                if (batchId === 'General') {
                    keyQuery.batchId = { $in: [null, undefined] };
                } else {
                    keyQuery.batchId = batchId;
                }

                if (req.user.role === 'trainer') {
                    keyQuery.trainerId = req.user._id;
                } else if (trainerId && trainerId !== 'all') {
                    keyQuery.trainerId = trainerId;
                }
                const keys = await TrainerExamKey.find(keyQuery).select('_id');
                const keyIds = keys.map(k => k._id);
                attemptsFilter.sessionId = { $in: keyIds };
            }

            reportTitle = `${exam?.title || 'Exam'}_Results`;
            const attempts = await StudentAttempt.find(attemptsFilter)
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });

            const questions = await Question.find({ examId: id }).sort({ order: 1 });

            // Build bespoke premium Excel workbook for this exam
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Ethnotech Academy';
            workbook.created = new Date();

            // Resolve Metadata Details for Top common details
            let selectedTrainerName = 'All Trainers';
            if (req.user.role === 'trainer') {
                selectedTrainerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.username;
            } else if (trainerId && trainerId !== 'all') {
                const tr = await User.findById(trainerId);
                if (tr) {
                    selectedTrainerName = `${tr.firstName || ''} ${tr.lastName || ''}`.trim() || tr.username;
                }
            } else if (attempts.length > 0) {
                const trainersList = Array.from(new Set(attempts.map(a => {
                    if (!a.trainerId) return null;
                    return `${a.trainerId.firstName || ''} ${a.trainerId.lastName || ''}`.trim() || a.trainerId.username;
                }).filter(Boolean)));
                if (trainersList.length > 0) {
                    selectedTrainerName = trainersList.join(', ');
                }
            }

            let selectedBatchName = 'All Batches';
            if (batchId === 'General') {
                selectedBatchName = 'General (No Batch)';
            } else if (batchId && batchId !== 'all') {
                const batch = await Batch.findById(batchId);
                if (batch) {
                    selectedBatchName = batch.batchName;
                }
            } else if (attempts.length > 0) {
                const batchesList = Array.from(new Set(attempts.map(a => a.sessionId?.batchId?.batchName).filter(Boolean)));
                if (batchesList.length > 0) {
                    selectedBatchName = batchesList.join(', ');
                }
            }

            let selectedDeptName = exam.department || 'All Departments';
            if (attempts.length > 0) {
                const deptsList = Array.from(new Set(attempts.map(a => a.studentDetails?.department).filter(Boolean)));
                if (deptsList.length > 0) {
                    selectedDeptName = deptsList.join(', ');
                }
            }

            const writeCommonDetailsHeader = (sheet, titlePrefix, headerColor) => {
                sheet.views = [{ showGridLines: true }];
                
                // Merge title block
                sheet.mergeCells('A1:J1');
                const titleRow = sheet.getRow(1);
                titleRow.getCell(1).value = `${titlePrefix} — ${exam.title}`;
                titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Inter' };
                titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
                titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                titleRow.height = 36;

                // Meta fields configuration
                const metaFields = [
                    ['College Name', exam.collegeId?.name || '—'],
                    ['Course Name', `${exam.courseId?.name || '—'} (${exam.courseId?.code || '—'})`],
                    ['Trainer Name', selectedTrainerName],
                    ['Batch Name', selectedBatchName],
                    ['Department', selectedDeptName]
                ];

                metaFields.forEach((item, mIdx) => {
                    const rowIdx = mIdx + 2;
                    sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
                    sheet.mergeCells(`C${rowIdx}:J${rowIdx}`);
                    
                    const cellKey = sheet.getCell(`A${rowIdx}`);
                    cellKey.value = item[0];
                    cellKey.font = { bold: true, size: 10, color: { argb: 'FF475569' }, name: 'Inter' };
                    cellKey.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                    cellKey.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

                    const cellVal = sheet.getCell(`C${rowIdx}`);
                    cellVal.value = item[1];
                    cellVal.font = { size: 10, name: 'Inter' };
                    cellVal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

                    sheet.getRow(rowIdx).height = 20;
                });

                // Spacer row
                sheet.getRow(7).height = 12;
            };

            // ─── SHEET 1: Summary / Dashboard ───
            const summarySheet = workbook.addWorksheet('📊 Overview');
            summarySheet.views = [{ showGridLines: true }];
            summarySheet.columns = [
                { header: 'Metric Category', key: 'category', width: 28 },
                { header: 'Details', key: 'details', width: 45 }
            ];
            styleHeader(summarySheet, 'FF004AAD');

            const totalPassed = attempts.filter(a => a.result === 'pass').length;
            const totalFailed = attempts.filter(a => a.result === 'fail').length;
            const completedAttempts = attempts.filter(a => a.status === 'completed');
            
            let avgScore = 0;
            let highScore = 0;
            let lowScore = attempts.length > 0 ? 100 : 0;
            
            if (attempts.length > 0) {
                const percentages = attempts.map(a => a.percentage || 0);
                avgScore = (percentages.reduce((sum, p) => sum + p, 0) / attempts.length).toFixed(2);
                highScore = Math.max(...percentages).toFixed(2);
                lowScore = Math.min(...percentages).toFixed(2);
            }

            // Suspected proctoring flags
            const suspectedCases = attempts.filter(a => {
                const v = a.violations || {};
                const totalViolations = (v.tabSwitches || 0) + (v.fullScreenExits || 0) + (v.copyAttempts || 0) + (v.devToolsAttempts || 0) + (v.windowBlurs || 0) + (v.overlaysDetected || 0) + (v.idleTimeouts || 0);
                return totalViolations >= 5 || a.isAutoSubmit;
            }).length;

            const summaryRows = [
                ['EXAM INFORMATION', ''],
                ['Exam Title', exam.title],
                ['Course Name', exam.courseId?.name || '—'],
                ['Course Code', exam.courseId?.code || '—'],
                ['Institution Name', exam.collegeId?.name || '—'],
                ['Exam Duration (Mins)', `${exam.duration} Minutes`],
                ['Total Questions Count', questions.length],
                ['Total Marks', exam.totalMarks],
                ['Passing Percentage', `${exam.passingPercentage || 40}%`],
                ['', ''], // Spacer
                ['CANDIDATE ATTEMPTS SUMMARY', ''],
                ['Total Candidates Started', attempts.length],
                ['Completed Assessments', completedAttempts.length],
                ['Candidates Passed', totalPassed],
                ['Candidates Failed', totalFailed],
                ['Overall Pass Rate', `${attempts.length > 0 ? ((totalPassed / attempts.length) * 100).toFixed(2) : 0}%`],
                ['Average Percentage Score', `${avgScore}%`],
                ['Highest Score Obtained', `${highScore}%`],
                ['Lowest Score Obtained', `${lowScore}%`],
                ['', ''], // Spacer
                ['PROCTORING & FAIRNESS METRICS', ''],
                ['Suspected Integrity Violations', suspectedCases],
                ['Report Generated On', new Date().toLocaleString()]
            ];

            summaryRows.forEach(([category, details], i) => {
                const row = summarySheet.addRow({ category, details });
                if (details === '' && category !== '') {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EEFF' } };
                    row.font = { bold: true, color: { argb: 'FF004AAD' }, size: 11, name: 'Segoe UI' };
                    row.height = 24;
                } else {
                    styleDataRow(row, i % 2 === 0);
                    row.height = 20;
                }
            });

            // ─── SHEET 2: Candidate Roster ───
            const rosterSheet = workbook.addWorksheet('📋 Candidate Roster');
            rosterSheet.columns = [
                { key: 'name', width: 24 },
                { key: 'roll', width: 18 },
                { key: 'score', width: 14 },
                { key: 'result', width: 12 },
                { key: 'percent', width: 16 },
                { key: 'status', width: 12 },
                { key: 'totalViolations', width: 15 },
                { key: 'timeTaken', width: 12 },
                { key: 'endTime', width: 20 },
                { key: 'ip', width: 15 }
            ];
            
            writeCommonDetailsHeader(rosterSheet, '📋 Candidate Roster', 'FF1E3A5F');

            const rosterHeaders = [
                'Student Name',
                'USN / Roll Number',
                'Score Obtained',
                'Pass or Fail',
                'Percentage Score',
                'Status',
                'Total Violations',
                'Time Taken',
                'Submitted Time',
                'IP Address'
            ];
            const rosterHeaderRow = rosterSheet.getRow(8);
            rosterHeaders.forEach((hdr, hIdx) => {
                const cell = rosterHeaderRow.getCell(hIdx + 1);
                cell.value = hdr;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF0F172A' } },
                    bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
                    left: { style: 'thin', color: { argb: 'FF0F172A' } },
                    right: { style: 'thin', color: { argb: 'FF0F172A' } }
                };
            });
            rosterHeaderRow.height = 24;

            attempts.forEach((a, index) => {
                let durationMins = '—';
                if (a.startedAt && a.completedAt) {
                    const diffMs = new Date(a.completedAt) - new Date(a.startedAt);
                    durationMins = `${Math.floor(diffMs / 60000)}m ${Math.floor((diffMs % 60000) / 1000)}s`;
                }

                const v = a.violations || {};
                const totalViolations = (v.tabSwitches || 0) + (v.fullScreenExits || 0) + (v.copyAttempts || 0) + (v.devToolsAttempts || 0) + (v.windowBlurs || 0) + (v.overlaysDetected || 0) + (v.idleTimeouts || 0);

                const row = rosterSheet.addRow({
                    name: a.studentDetails?.name || '—',
                    roll: a.studentDetails?.rollNumber || '—',
                    score: `${a.totalScore || 0} / ${exam.totalMarks}`,
                    result: (a.result || 'pending').toUpperCase(),
                    percent: `${(a.percentage || 0).toFixed(2)}%`,
                    status: (a.status || 'started').toUpperCase(),
                    totalViolations,
                    timeTaken: durationMins,
                    endTime: a.completedAt ? new Date(a.completedAt).toLocaleString('en-IN') : '—',
                    ip: a.ipAddress || '—'
                });

                styleDataRow(row, index % 2 === 0);
                row.height = 22;

                const resultCell = row.getCell('result');
                if (a.result === 'pass') {
                    resultCell.font = { bold: true, color: { argb: 'FF166534' } };
                    resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                } else if (a.result === 'fail') {
                    resultCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                    resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                }

                const vioCell = row.getCell('totalViolations');
                if (totalViolations >= 5) {
                    vioCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                    vioCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                }
            });

            // ─── SHEET 3: Response Matrix ───
            const responseSheet = workbook.addWorksheet('📝 Response Matrix');
            const respColumns = [
                { key: 'name', width: 24 },
                { key: 'roll', width: 18 }
            ];
            questions.forEach((q) => {
                respColumns.push({
                    key: `q_${q._id}`,
                    width: 25
                });
            });
            responseSheet.columns = respColumns;

            writeCommonDetailsHeader(responseSheet, '📝 Response Matrix', 'FF6366F1');

            const matrixHeaders = ['Student Name', 'USN / Roll Number'];
            questions.forEach((q, qIdx) => {
                const plainText = q.text?.replace(/<[^>]*>/g, '').substring(0, 35) || 'Question';
                matrixHeaders.push(`Q${qIdx + 1}: ${plainText} (${q.points} pt)`);
            });
            const matrixHeaderRow = responseSheet.getRow(8);
            matrixHeaders.forEach((hdr, hIdx) => {
                const cell = matrixHeaderRow.getCell(hIdx + 1);
                cell.value = hdr;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF4F46E5' } },
                    bottom: { style: 'thin', color: { argb: 'FF4F46E5' } },
                    left: { style: 'thin', color: { argb: 'FF4F46E5' } },
                    right: { style: 'thin', color: { argb: 'FF4F46E5' } }
                };
            });
            matrixHeaderRow.height = 26;

            attempts.forEach((a, index) => {
                const rowData = {
                    name: a.studentDetails?.name || '—',
                    roll: a.studentDetails?.rollNumber || '—'
                };

                questions.forEach(q => {
                    const ansObj = a.answers?.find(ans => ans.questionId?.toString() === q._id?.toString());
                    if (ansObj) {
                        const answerText = Array.isArray(ansObj.answer) ? ansObj.answer.join(', ') : (ansObj.answer || '—');
                        const statusMark = ansObj.isCorrect ? '✔' : '✘';
                        rowData[`q_${q._id}`] = `[${statusMark}] ${answerText} (${ansObj.marksObtained || 0} pts)`;
                    } else {
                        rowData[`q_${q._id}`] = '[✘] Unattempted (0 pts)';
                    }
                });

                const row = responseSheet.addRow(rowData);
                styleDataRow(row, index % 2 === 0);
                row.height = 20;

                questions.forEach((q, qColIdx) => {
                    const cellIdx = 3 + qColIdx;
                    const cell = row.getCell(cellIdx);
                    const val = cell.value?.toString() || '';
                    if (val.includes('[✔]')) {
                        cell.font = { color: { argb: 'FF166534', name: 'Segoe UI' }, size: 9 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                    } else {
                        cell.font = { color: { argb: 'FF991B1B', name: 'Segoe UI' }, size: 9 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    }
                });
            });

            // ─── SHEET 4: Item Analysis / Question Difficulty ───
            const diffSheet = workbook.addWorksheet('📈 Item Analysis');
            diffSheet.columns = [
                { key: 'qno', width: 8 },
                { key: 'type', width: 18 },
                { key: 'text', width: 50 },
                { key: 'points', width: 12 },
                { key: 'total', width: 15 },
                { key: 'correct', width: 16 },
                { key: 'avgTime', width: 16 },
                { key: 'accuracy', width: 14 },
                { key: 'difficulty', width: 16 }
            ];

            writeCommonDetailsHeader(diffSheet, '📈 Item Analysis', 'FF10B981');

            const diffHeaders = ['Q. No', 'Question Type', 'Question Text', 'Max Marks', 'Total Attempts', 'Correct Answers', 'Avg Time Spent', 'Accuracy %', 'Difficulty Index'];
            const diffHeaderRow = diffSheet.getRow(8);
            diffHeaders.forEach((hdr, hIdx) => {
                const cell = diffHeaderRow.getCell(hIdx + 1);
                cell.value = hdr;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF059669' } },
                    bottom: { style: 'thin', color: { argb: 'FF059669' } },
                    left: { style: 'thin', color: { argb: 'FF059669' } },
                    right: { style: 'thin', color: { argb: 'FF059669' } }
                };
            });
            diffHeaderRow.height = 24;

            questions.forEach((q, qIdx) => {
                let totalAttempted = 0;
                let totalCorrect = 0;
                let totalTime = 0;

                attempts.forEach(a => {
                    const ans = a.answers?.find(ans => ans.questionId?.toString() === q._id?.toString());
                    if (ans) {
                        totalAttempted++;
                        if (ans.isCorrect) totalCorrect++;
                        if (ans.timeSpent) totalTime += ans.timeSpent;
                    }
                });

                const accuracyVal = totalAttempted > 0 ? (totalCorrect / totalAttempted) : 0;
                const accuracyPercent = (accuracyVal * 100).toFixed(1);
                const avgTimeSecs = totalAttempted > 0 ? (totalTime / totalAttempted).toFixed(1) : 0;
                const difficultyText = accuracyVal < 0.35 ? 'Hard' : (accuracyVal > 0.75 ? 'Easy' : 'Medium');

                const row = diffSheet.addRow({
                    qno: `Q${qIdx + 1}`,
                    type: (q.type || 'MCQ').toUpperCase(),
                    text: q.text?.replace(/<[^>]*>/g, '') || '—',
                    points: q.points || 1,
                    total: totalAttempted,
                    correct: totalCorrect,
                    avgTime: `${avgTimeSecs}s`,
                    accuracy: `${accuracyPercent}%`,
                    difficulty: difficultyText
                });

                styleDataRow(row, qIdx % 2 === 0);
                row.height = 20;

                const accCell = row.getCell('accuracy');
                const diffCell = row.getCell('difficulty');
                if (accuracyVal >= 0.75) {
                    accCell.font = { bold: true, color: { argb: 'FF166534' } };
                    diffCell.font = { bold: true, color: { argb: 'FF166534' } };
                    diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                } else if (accuracyVal < 0.35) {
                    accCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                    diffCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                    diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                } else {
                    accCell.font = { bold: true, color: { argb: 'FFD97706' } };
                    diffCell.font = { bold: true, color: { argb: 'FFD97706' } };
                    diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE3C7' } };
                }
            });

            // ─── SHEET 5: Proctoring Log ───
            const integritySheet = workbook.addWorksheet('🛡️ Proctoring Log');
            integritySheet.columns = [
                { key: 'name', width: 24 },
                { key: 'roll', width: 18 },
                { key: 'tab', width: 14 },
                { key: 'dev', width: 15 },
                { key: 'overlay', width: 14 },
                { key: 'idle', width: 14 },
                { key: 'blur', width: 14 },
                { key: 'copy', width: 14 },
                { key: 'auto', width: 15 },
                { key: 'status', width: 16 }
            ];

            writeCommonDetailsHeader(integritySheet, '🛡️ Proctoring Log', 'FFDC2626');

            const integrityHeaders = ['Student Name', 'USN / Roll Number', 'Tab Switches', 'DevTools Opens', 'Overlay / Ads', 'Idle Timeouts', 'Window Blurs', 'Copy Attempts', 'Auto-Submitted', 'Integrity Status'];
            const integrityHeaderRow = integritySheet.getRow(8);
            integrityHeaders.forEach((hdr, hIdx) => {
                const cell = integrityHeaderRow.getCell(hIdx + 1);
                cell.value = hdr;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Inter' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF991B1B' } },
                    bottom: { style: 'thin', color: { argb: 'FF991B1B' } },
                    left: { style: 'thin', color: { argb: 'FF991B1B' } },
                    right: { style: 'thin', color: { argb: 'FF991B1B' } }
                };
            });
            integrityHeaderRow.height = 24;

            attempts.forEach((a, index) => {
                const v = a.violations || {};
                const totalViolations = (v.tabSwitches || 0) + (v.fullScreenExits || 0) + (v.copyAttempts || 0) + (v.devToolsAttempts || 0) + (v.windowBlurs || 0) + (v.overlaysDetected || 0) + (v.idleTimeouts || 0);

                let securityStatus = 'CLEAR';
                let riskColor = 'FF166534';
                let riskBg = 'FFDCFCE7';

                if (v.devToolsAttempts > 0 || v.idleTimeouts >= 2 || totalViolations >= 5 || a.isAutoSubmit) {
                    securityStatus = 'HIGH RISK';
                    riskColor = 'FF991B1B';
                    riskBg = 'FFFEE2E2';
                } else if (v.tabSwitches > 1 || v.copyAttempts > 0 || totalViolations > 1) {
                    securityStatus = 'SUSPICIOUS';
                    riskColor = 'FFB45309';
                    riskBg = 'FEF3C7';
                }

                const row = integritySheet.addRow({
                    name: a.studentDetails?.name || '—',
                    roll: a.studentDetails?.rollNumber || '—',
                    tab: v.tabSwitches || 0,
                    dev: v.devToolsAttempts || 0,
                    overlay: v.overlaysDetected || 0,
                    idle: v.idleTimeouts || 0,
                    blur: v.windowBlurs || 0,
                    copy: v.copyAttempts || 0,
                    auto: a.isAutoSubmit ? 'YES' : 'NO',
                    status: securityStatus
                });

                styleDataRow(row, index % 2 === 0);
                row.height = 20;

                const statusCell = row.getCell('status');
                statusCell.font = { bold: true, color: { argb: riskColor } };
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riskBg } };
            });

            // Write and send response
            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${reportTitle}.xlsx"`);
            res.send(buffer);
            return;

        } else if (type === 'overall') {
            reportTitle = 'Overall_Platform_Report';
            attempts = await StudentAttempt.find({})
                .populate({ path: 'examId', select: 'title department collegeId courseId', populate: { path: 'courseId collegeId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            courses = await Course.find({});
        }

        // ========== Build Workbook ==========
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Ethnotech Academy';
        workbook.created = new Date();

        const dataColumns = [
            { header: 'Student Name', key: 'name', width: 24 },
            { header: 'Roll Number', key: 'roll', width: 18 },
            { header: 'Mobile', key: 'mobile', width: 14 },
            { header: 'Department', key: 'dept', width: 18 },
            { header: 'Exam Title', key: 'exam', width: 30 },
            { header: 'Trainer', key: 'trainer', width: 20 },
            { header: 'Batch', key: 'batch', width: 15 },
            { header: 'Score', key: 'score', width: 10 },
            { header: 'Percentage', key: 'percent', width: 13 },
            { header: 'Result', key: 'result', width: 10 },
            { header: 'Violations', key: 'violations', width: 11 },
            { header: 'Date', key: 'date', width: 16 }
        ];

        // ========== SHEET 1: Summary ==========
        const summarySheet = workbook.addWorksheet('📊 Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];
        styleHeader(summarySheet);

        const totalPassed = attempts.filter(a => a.result === 'pass').length;
        const avgScore = attempts.length > 0 ? (attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length).toFixed(2) : 0;
        const passRate = attempts.length > 0 ? ((totalPassed / attempts.length) * 100).toFixed(2) : 0;

        const summaryData = [
            ['Report Type', type?.toUpperCase() || 'OVERALL'],
            ['Generated On', new Date().toLocaleString()],
            ['Total Attempts', attempts.length],
            ['Total Passed', totalPassed],
            ['Total Failed', attempts.length - totalPassed],
            ['Average Score', `${avgScore}%`],
            ['Overall Pass Rate', `${passRate}%`],
            ['Total Courses', courses.length],
        ];
        summaryData.forEach(([metric, value], i) => {
            const row = summarySheet.addRow({ metric, value });
            styleDataRow(row, i % 2 === 0);
        });

        // ========== SHEET 2: All Data ==========
        const allSheet = workbook.addWorksheet('📋 All Students');
        allSheet.columns = dataColumns;
        styleHeader(allSheet);
        attempts.forEach((a, i) => {
            const trainerName = a.trainerId
                ? (`${a.trainerId.firstName || ''} ${a.trainerId.lastName || ''}`.trim() || a.trainerId.phone || a.trainerId.username || 'System')
                : 'System';
            const batchName = a.sessionId?.batchId?.batchName || 'General';
            const row = allSheet.addRow({
                name: a.studentDetails?.name || '—',
                roll: a.studentDetails?.rollNumber || '—',
                mobile: a.studentDetails?.mobile || '—',
                dept: a.studentDetails?.department || a.examId?.department || '—',
                exam: a.examId?.title || '—',
                trainer: trainerName,
                batch: batchName,
                score: a.totalScore || 0,
                percent: `${(a.percentage || 0).toFixed(2)}%`,
                result: (a.result || 'pending').toUpperCase(),
                violations: (a.violations?.tabSwitches || 0) + (a.violations?.fullScreenExits || 0) + (a.violations?.copyAttempts || 0),
                date: a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-IN') : '—'
            });
            styleDataRow(row, i % 2 === 0);
            // Color result cell
            const resultCell = row.getCell('result');
            if (a.result === 'pass') {
                resultCell.font = { bold: true, color: { argb: 'FF166534' } };
                resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            } else if (a.result === 'fail') {
                resultCell.font = { bold: true, color: { argb: 'FF991B1B' } };
                resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            }
        });

        // ========== SHEET PER COURSE ==========
        // Group attempts by courseId
        const courseAttemptMap = {};
        attempts.forEach(a => {
            const cid = a.examId?.courseId?._id?.toString() || a.examId?.courseId?.toString() || 'unknown';
            if (!courseAttemptMap[cid]) courseAttemptMap[cid] = [];
            courseAttemptMap[cid].push(a);
        });

        const usedSheetNames = new Set();
        
        for (const [cid, cAttempts] of Object.entries(courseAttemptMap)) {
            const courseObj = courses.find(c => c._id?.toString() === cid);
            const courseName = courseObj?.name || cAttempts[0]?.examId?.courseId?.name || 'Unknown Course';
            const courseCode = courseObj?.code || cAttempts[0]?.examId?.courseId?.code || 'UNK';
            
            // Generate valid, unique sheet name
            let baseName = `${courseCode} ${courseName}`.replace(/[\\/*?:\[\]]/g, '').trim().substring(0, 31);
            if (!baseName) baseName = 'Course';
            let sheetName = baseName;
            let counter = 1;
            while(usedSheetNames.has(sheetName)) {
                sheetName = `${baseName.substring(0, 31 - (counter.toString().length + 1))}_${counter}`;
                counter++;
            }
            usedSheetNames.add(sheetName);

            const courseSheet = workbook.addWorksheet(sheetName);

            // Course stats header block
            const cPassed = cAttempts.filter(a => a.result === 'pass').length;
            const cAvg = cAttempts.length > 0 ? (cAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / cAttempts.length).toFixed(2) : 0;
            const cPassRate = cAttempts.length > 0 ? ((cPassed / cAttempts.length) * 100).toFixed(2) : 0;

            // Title row
            courseSheet.mergeCells('A1:K1');
            const titleRow = courseSheet.getRow(1);
            titleRow.getCell(1).value = `📚 ${courseName} (${courseCode}) — Course Analytics`;
            titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
            titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
            titleRow.height = 28;

            // Stats row
            courseSheet.mergeCells('A2:C2');
            courseSheet.mergeCells('D2:F2');
            courseSheet.mergeCells('G2:I2');
            courseSheet.mergeCells('J2:K2');
            const statsRow = courseSheet.getRow(2);
            const statStyle = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EEFF' } }, font: { bold: true } };
            statsRow.getCell(1).value = `Total Attempts: ${cAttempts.length}`;
            statsRow.getCell(4).value = `Avg Score: ${cAvg}%`;
            statsRow.getCell(7).value = `Pass Rate: ${cPassRate}%`;
            statsRow.getCell(10).value = `Passed: ${cPassed} / Failed: ${cAttempts.length - cPassed}`;
            ['A2', 'D2', 'G2', 'J2'].forEach(cell => {
                courseSheet.getCell(cell).fill = statStyle.fill;
                courseSheet.getCell(cell).font = statStyle.font;
                courseSheet.getCell(cell).alignment = { vertical: 'middle', horizontal: 'center' };
            });
            statsRow.height = 20;

            // Data header at row 3
            courseSheet.columns = dataColumns;
            const headerRow = courseSheet.getRow(3);
            dataColumns.forEach((col, i) => { headerRow.getCell(i + 1).value = col.header; });
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 20;
            headerRow.commit();

            // Data rows
            cAttempts.forEach((a, i) => {
                const trainerName = a.trainerId
                    ? (`${a.trainerId.firstName || ''} ${a.trainerId.lastName || ''}`.trim() || a.trainerId.phone || a.trainerId.username || 'System')
                    : 'System';
                const batchName = a.sessionId?.batchId?.batchName || 'General';
                const row = courseSheet.getRow(i + 4);
                const values = {
                    name: a.studentDetails?.name || '—', roll: a.studentDetails?.rollNumber || '—',
                    mobile: a.studentDetails?.mobile || '—', dept: a.studentDetails?.department || a.examId?.department || '—',
                    exam: a.examId?.title || '—', trainer: trainerName, batch: batchName, score: a.totalScore || 0,
                    percent: `${(a.percentage || 0).toFixed(2)}%`, result: (a.result || 'pending').toUpperCase(),
                    violations: (a.violations?.tabSwitches || 0) + (a.violations?.fullScreenExits || 0) + (a.violations?.copyAttempts || 0),
                    date: a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-IN') : '—'
                };
                dataColumns.forEach((col, ci) => { row.getCell(ci + 1).value = values[col.key]; });
                styleDataRow(row, i % 2 === 0);
                // Result color (column 10 since batch column added at index 7)
                const resultCell = row.getCell(10);
                if (a.result === 'pass') { resultCell.font = { bold: true, color: { argb: 'FF166534' } }; resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; }
                else if (a.result === 'fail') { resultCell.font = { bold: true, color: { argb: 'FF991B1B' } }; resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; }
                row.commit();
            });
        }

        // ========== SHEET: Trainer-wise Summary ==========
        const trainerSheet = workbook.addWorksheet('👨‍🏫 Trainers');
        trainerSheet.columns = [
            { header: 'Trainer Name', key: 'name', width: 25 },
            { header: 'Mobile', key: 'phone', width: 15 },
            { header: 'Total Attempts', key: 'total', width: 16 },
            { header: 'Passed', key: 'passed', width: 12 },
            { header: 'Failed', key: 'failed', width: 12 },
            { header: 'Avg Score', key: 'avg', width: 13 },
            { header: 'Pass Rate', key: 'rate', width: 12 }
        ];
        styleHeader(trainerSheet, 'FF1E3A5F');

        // Group by trainer
        const tMap = {};
        attempts.forEach(a => {
            const key = a.trainerId?._id?.toString() || a.trainerId?.toString() || 'system';
            if (!tMap[key]) {
                tMap[key] = {
                    name: a.trainerId ? (`${a.trainerId.firstName || ''} ${a.trainerId.lastName || ''}`.trim() || a.trainerId.phone || a.trainerId.username || 'System') : 'System',
                    phone: a.trainerId?.phone || '—',
                    total: 0, passed: 0, score: 0
                };
            }
            tMap[key].total++;
            if (a.result === 'pass') tMap[key].passed++;
            tMap[key].score += (a.percentage || 0);
        });
        Object.values(tMap).forEach((t, i) => {
            const row = trainerSheet.addRow({
                name: t.name, phone: t.phone, total: t.total, passed: t.passed,
                failed: t.total - t.passed,
                avg: `${t.total > 0 ? (t.score / t.total).toFixed(2) : 0}%`,
                rate: `${t.total > 0 ? ((t.passed / t.total) * 100).toFixed(2) : 0}%`
            });
            styleDataRow(row, i % 2 === 0);
        });

        // ========== SHEET: Integrity Map ==========
        const integritySheet = workbook.addWorksheet('🛡️ Integrity Map');
        integritySheet.columns = [
            { header: 'Student Name', key: 'name', width: 25 },
            { header: 'Roll Number', key: 'roll', width: 15 },
            { header: 'DevTools Opens', key: 'dev', width: 14 },
            { header: 'Overlay/Ads Hit', key: 'overlay', width: 14 },
            { header: 'Idle Timeouts', key: 'idle', width: 14 },
            { header: 'Tab Switches', key: 'tab', width: 14 },
            { header: 'FullScreen Exits', key: 'fs', width: 16 },
            { header: 'Copy/Paste', key: 'copy', width: 12 },
            { header: 'Auto-Submitted', key: 'auto', width: 14 }
        ];
        styleHeader(integritySheet, 'FFB91C1C'); // Red-ish header

        attempts.forEach((a, i) => {
            const v = a.violations || {};
            const row = integritySheet.addRow({
                name: a.studentDetails?.name || '—',
                roll: a.studentDetails?.rollNumber || '—',
                dev: v.devToolsAttempts || 0,
                overlay: v.overlaysDetected || 0,
                idle: v.idleTimeouts || 0,
                tab: v.tabSwitches || 0,
                fs: v.fullScreenExits || 0,
                copy: v.copyAttempts || 0,
                auto: a.isAutoSubmit ? 'Yes' : 'No'
            });
            
            styleDataRow(row, i % 2 === 0);
            
            // Highlight highly suspicious rows
            const totalSus = Object.values(v).reduce((acc, val) => acc + (val || 0), 0);
            if (totalSus >= 3 || a.isAutoSubmit) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
                row.font = { color: { argb: 'FF991B1B' } };
            }
        });

        // ========== SHEET: Question Difficulty Index ==========
        const diffSheet = workbook.addWorksheet('📊 Difficulty Index');
        diffSheet.columns = [
            { header: 'Question ID', key: 'id', width: 25 },
            { header: 'Total Attempts', key: 'total', width: 16 },
            { header: 'Correct Answers', key: 'correct', width: 16 },
            { header: 'Pass Rate / Difficulty Index', key: 'index', width: 28 },
            { header: 'Average Time (s)', key: 'time', width: 18 }
        ];
        styleHeader(diffSheet, 'FF10B981'); // Emerald green
        
        const qStats = {};
        attempts.forEach(a => {
            if (Array.isArray(a.answers)) {
                a.answers.forEach(ans => {
                    const qid = ans.questionId?.toString();
                    if (!qid) return;
                    if (!qStats[qid]) qStats[qid] = { total: 0, correct: 0, time: 0 };
                    qStats[qid].total++;
                    if (ans.isCorrect) qStats[qid].correct++;
                    if (ans.timeSpent) qStats[qid].time += ans.timeSpent;
                });
            }
        });

        Object.keys(qStats).forEach((qid, i) => {
            const st = qStats[qid];
            const pRate = st.total > 0 ? (st.correct / st.total) : 0;
            const diffText = pRate < 0.3 ? 'Hard' : (pRate > 0.7 ? 'Easy' : 'Medium');
            const row = diffSheet.addRow({
                id: qid,
                total: st.total,
                correct: st.correct,
                index: `${(pRate * 100).toFixed(1)}% (${diffText})`,
                time: st.total > 0 ? (st.time / st.total).toFixed(1) : 0
            });
            styleDataRow(row, i % 2 === 0);
        });

        // Send response
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${reportTitle}.xlsx"`);
        res.send(buffer);

    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== Leaderboard ==========
// GET /api/analytics/leaderboard?examId=...&courseId=...&collegeId=...&limit=20
exports.getLeaderboard = async (req, res) => {
    try {
        const { examId, courseId, collegeId } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        let examIds = [];

        if (examId) {
            examIds = [examId];
        } else if (courseId) {
            const exams = await Exam.find({ courseId }).select('_id');
            examIds = exams.map(e => e._id);
        } else if (collegeId) {
            const exams = await Exam.find({ collegeId }).select('_id');
            examIds = exams.map(e => e._id);
        } else if (req.user.role === 'college_admin') {
            const exams = await Exam.find({ collegeId: req.user.collegeId }).select('_id');
            examIds = exams.map(e => e._id);
        } else {
            // Super admin — overall
            const exams = await Exam.find({}).select('_id');
            examIds = exams.map(e => e._id);
        }

        const attempts = await StudentAttempt.find({
            examId: { $in: examIds },
            status: 'completed'
        })
        .populate('examId', 'title totalMarks courseId')
        .sort({ percentage: -1, totalScore: -1 })
        .limit(limit * 3); // over-fetch to deduplicate by student

        // Deduplicate: keep best attempt per student (by rollNumber across all exams)
        const seen = new Set();
        const leaderboard = [];
        for (const a of attempts) {
            const key = a.studentDetails?.rollNumber;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            leaderboard.push({
                rank: leaderboard.length + 1,
                name: a.studentDetails?.name || '—',
                rollNumber: a.studentDetails?.rollNumber || '—',
                department: a.studentDetails?.department || '—',
                examTitle: a.examId?.title || '—',
                score: a.totalScore || 0,
                totalMarks: a.examId?.totalMarks || 0,
                percentage: parseFloat((a.percentage || 0).toFixed(2)),
                result: a.result,
                completedAt: a.completedAt
            });
            if (leaderboard.length >= limit) break;
        }

        res.json({ success: true, count: leaderboard.length, data: leaderboard });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
