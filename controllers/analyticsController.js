const StudentAttempt = require('../models/StudentAttempt');
const Exam = require('../models/Exam');
const User = require('../models/User');
const Course = require('../models/Course');
const College = require('../models/College');
const ExcelJS = require('exceljs');
const TrainingLog = require('../models/TrainingLog');
const TrainerExamKey = require('../models/TrainerExamKey');

// ========== Helper: style header row ==========
function styleHeader(sheet, color = 'FF004AAD') {
    const row = sheet.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.height = 22;
    row.commit();
}

function styleDataRow(row, isEven) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F4FF' : 'FFFFFFFF' } };
    row.alignment = { vertical: 'middle' };
}

// ========== College Analytics ==========
exports.getCollegeAnalytics = async (req, res) => {
    try {
        const collegeId = req.user.role === 'college_admin' ? req.user.collegeId : (req.query.collegeId || null);

        const { courseId, trainerId } = req.query;
        let examQuery = {};
        if (collegeId) examQuery.collegeId = collegeId;
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
        if (collegeId) trainerFilter.$or = [{ collegeId }, { assignedColleges: collegeId }];
        
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

        let courseQuery = {};
        if (collegeId) courseQuery.collegeId = collegeId;
        const courses = await Course.find(courseQuery);
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
        let query = { trainerId };
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
            if (req.user.role === 'college_admin') {
                filter.collegeId = req.user.collegeId;
                const coll = await College.findById(req.user.collegeId);
                if (coll) {
                    collegeName = coll.name;
                }
            } else if (req.user.role === 'super_admin') {
                const targetCollegeId = req.query.collegeId;
                if (targetCollegeId && targetCollegeId !== 'all') {
                    filter.collegeId = targetCollegeId;
                    const coll = await College.findById(targetCollegeId);
                    if (coll) {
                        collegeName = coll.name;
                    }
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

            const logs = await TrainingLog.find(filter)
                .populate('trainerId', 'username firstName lastName phone')
                .populate('collegeId', 'name')
                .populate('courseId', 'name code')
                .sort({ logDate: -1, createdAt: -1 });

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
            const logColumns = [
                { header: 'Trainer Name', key: 'trainerName', width: 22 },
                { header: 'Log Date', key: 'logDate', width: 14 },
                { header: 'Topic Covered', key: 'topics', width: 35 },
                { header: 'Head Count', key: 'present', width: 12 },
                { header: 'Actual Count', key: 'total', width: 12 },
                { header: 'Attendance %', key: 'attendanceRate', width: 14 },
                { header: 'College Name', key: 'collegeName', width: 28 },
                { header: 'Trainer Phone', key: 'trainerPhone', width: 15 },
                { header: 'Trainer Start Date', key: 'trainerStartDate', width: 18 },
                { header: 'Batch Name', key: 'batchName', width: 14 },
                { header: 'Time Slot', key: 'timeSlot', width: 22 },
                { header: 'Department', key: 'dept', width: 16 },
                { header: 'Module', key: 'module', width: 18 }
            ];

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
                logsSheet.columns = logColumns;
                styleHeader(logsSheet);

                let rowIndex = 0;
                courseGroup.entries.forEach((log) => {
                    const currentCollegeName = log.collegeId?.name || '—';
                    const trainerName = log.trainerId
                        ? (`${log.trainerId.firstName || ''} ${log.trainerId.lastName || ''}`.trim() || log.trainerId.phone || log.trainerId.username || 'System')
                        : 'System';
                    const trainerPhone = log.trainerId?.phone || '—';
                    const startDateStr = log.startDate ? new Date(log.startDate).toLocaleDateString('en-IN') : '—';
                    const logDateStr = log.logDate ? new Date(log.logDate).toLocaleDateString('en-IN') : '—';

                    if (Array.isArray(log.batches)) {
                        log.batches.forEach(b => {
                            const attRate = b.actualCount > 0 ? ((b.presentCount / b.actualCount) * 100).toFixed(2) : 0;
                            const row = logsSheet.addRow({
                                logDate: logDateStr,
                                collegeName: currentCollegeName,
                                trainerName: trainerName,
                                trainerPhone: trainerPhone,
                                trainerStartDate: startDateStr,
                                batchName: b.batchName || '—',
                                timeSlot: b.timeSlot || '—',
                                dept: b.department || '—',
                                module: b.moduleTaught || '—',
                                present: b.presentCount || 0,
                                total: b.actualCount || 0,
                                attendanceRate: `${attRate}%`,
                                topics: b.topicsCovered || '—'
                            });
                            styleDataRow(row, rowIndex % 2 === 0);
                            
                            // Color the attendanceRate cell based on percentage
                            const rateCell = row.getCell('attendanceRate');
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

        if (type === 'college' || (!type && req.user.role === 'college_admin')) {
            const cid = id || req.user.collegeId?.toString();
            const college = await College.findById(cid);
            reportTitle = `${college?.name || 'College'}_Report`;
            collegeId = cid;
            exams = await Exam.find({ collegeId: cid }).populate('courseId', 'name code');
            const examIds = exams.map(e => e._id);
            attempts = await StudentAttempt.find({ examId: { $in: examIds } })
                .populate({ path: 'examId', select: 'title department courseId', populate: { path: 'courseId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            courses = await Course.find({ collegeId: cid });

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
            const exam = await Exam.findById(id).populate('courseId', 'name code');
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
            attempts = await StudentAttempt.find(attemptsFilter)
                .populate({ path: 'examId', select: 'title department courseId collegeId', populate: { path: 'courseId', select: 'name code' } })
                .populate('trainerId', 'username firstName lastName phone')
                .populate({ path: 'sessionId', populate: { path: 'batchId', select: 'batchName' } });
            courses = exam?.courseId ? [exam.courseId] : [];

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
