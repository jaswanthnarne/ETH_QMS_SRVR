const Student = require('../models/Student');
const Batch = require('../models/Batch');
const ExcelJS = require('exceljs');
const { logAudit } = require('../utils/auditHelper');

// @desc    Get all students in a batch
// @route   GET /api/admin/batches/:batchId/students
exports.getStudentsByBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to access students for this batch' });
            }
        }

        const students = await Student.find({ batchId })
            .sort({ usn: 1 });

        res.json({ success: true, count: students.length, data: students });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get all students in a college
// @route   GET /api/admin/colleges/:collegeId/students
// @access  Private (Admin)
exports.getStudentsByCollege = async (req, res) => {
    try {
        const { collegeId } = req.params;
        
        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to access students for this college' });
            }
        }

        const students = await Student.find({ collegeId })
            .populate('batchId', 'batchName')
            .sort({ name: 1 });
        res.json({ success: true, count: students.length, data: students });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Import students from Excel file
// @route   POST /api/admin/batches/:batchId/students/import
exports.importStudents = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { batchId } = req.params;

        // Verify the batch exists
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to import students for this batch' });
            }
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];

        if (!sheet) {
            return res.status(400).json({ success: false, error: 'Excel file contains no worksheets' });
        }

        const results = { created: 0, updated: 0, skipped: 0, errors: [], skippedStudents: [] };

        const rows = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            const name = row.getCell(1).value?.toString()?.trim();
            const usn = row.getCell(2).value?.toString()?.trim();
            const mobile = row.getCell(3).value?.toString()?.trim();
            const email = row.getCell(4).value?.toString()?.trim();
            const semester = row.getCell(5).value?.toString()?.trim();
            const department = row.getCell(6).value?.toString()?.trim();
            const division = row.getCell(7).value?.toString()?.trim();
            const cgpa = parseFloat(row.getCell(8).value?.toString()?.trim() || '0');
            const backlogs = parseInt(row.getCell(9).value?.toString()?.trim() || '0');

            if (!name) {
                results.errors.push({ row: rowNumber, error: 'Student name is required' });
                return;
            }
            if (!usn) {
                results.errors.push({ row: rowNumber, error: 'USN is required' });
                return;
            }

            rows.push({ name, usn, mobile, email, semester, department, division, cgpa, backlogs, rowNumber });
        });

        // Process each row
        for (const row of rows) {
            try {
                const existingStudent = await Student.findOne({ usn: row.usn, collegeId: batch.collegeId })
                    .populate('collegeId', 'name')
                    .populate('batchId', 'batchName');

                if (existingStudent) {
                    // Skip and report duplicate details
                    results.skippedStudents.push({
                        name: row.name,
                        usn: row.usn,
                        currentCollege: existingStudent.collegeId?.name || 'Unknown College',
                        currentBatch: existingStudent.batchId?.batchName || 'Unknown Batch'
                    });
                    results.skipped++;
                } else {
                    // Create new student
                    await Student.create({
                        batchId,
                        collegeId: batch.collegeId,
                        name: row.name,
                        usn: row.usn,
                        mobile: row.mobile,
                        email: row.email,
                        semester: row.semester,
                        department: row.department,
                        division: row.division,
                        cgpa: row.cgpa || 0,
                        backlogs: row.backlogs || 0
                    });
                    results.created++;
                }
            } catch (err) {
                results.errors.push({ row: row.rowNumber, error: err.message });
            }
        }

        // Update the batch student count
        const totalStudents = await Student.countDocuments({ batchId, status: 'active' });
        batch.studentCount = totalStudents;
        await batch.save();

        await logAudit(req, 'IMPORT_STUDENTS', 'Batch', batch._id, batch.batchName,
            { created: results.created, skipped: results.skipped });

        res.json({
            success: true,
            message: `Import complete: ${results.created} created, ${results.skipped} skipped.`,
            data: results
        });
    } catch (error) {
        console.error('Student import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Parse students from Excel file (without saving to DB)
// @route   POST /api/admin/batches/:batchId/students/parse
exports.parseStudentsExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { batchId } = req.params;

        // Verify the batch exists
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to parse students for this batch' });
            }
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];

        if (!sheet) {
            return res.status(400).json({ success: false, error: 'Excel file contains no worksheets' });
        }

        const parsedRows = [];
        const usns = new Set();
        const duplicateUsnsInExcel = new Set();

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            const name = row.getCell(1).value?.toString()?.trim() || '';
            const usn = row.getCell(2).value?.toString()?.trim()?.toUpperCase() || '';
            const mobile = row.getCell(3).value?.toString()?.trim() || '';
            const email = row.getCell(4).value?.toString()?.trim() || '';
            const semester = row.getCell(5).value?.toString()?.trim() || '';
            const department = row.getCell(6).value?.toString()?.trim() || '';
            const division = row.getCell(7).value?.toString()?.trim() || '';
            const cgpa = parseFloat(row.getCell(8).value?.toString()?.trim() || '0');
            const backlogs = parseInt(row.getCell(9).value?.toString()?.trim() || '0');

            if (usn) {
                if (usns.has(usn)) {
                    duplicateUsnsInExcel.add(usn);
                }
                usns.add(usn);
            }

            parsedRows.push({
                name,
                usn,
                mobile,
                email,
                semester,
                department,
                division,
                cgpa,
                backlogs,
                rowNumber
            });
        });

        // Query database for all these USNs in one go
        const usnsArray = Array.from(usns);
        const existingStudents = await Student.find({ usn: { $in: usnsArray }, collegeId: batch.collegeId })
            .populate('collegeId', 'name')
            .populate('batchId', 'batchName');

        const dbStudentMap = new Map();
        existingStudents.forEach(s => {
            dbStudentMap.set(s.usn.toUpperCase(), s);
        });

        const students = parsedRows.map(row => {
            let error = null;
            let originalError = null;

            if (!row.name) {
                error = 'Student name is required';
            } else if (!row.usn) {
                error = 'USN is required';
            } else if (duplicateUsnsInExcel.has(row.usn)) {
                error = 'Duplicate USN in spreadsheet';
            } else if (dbStudentMap.has(row.usn)) {
                const s = dbStudentMap.get(row.usn);
                const currentBatchId = s.batchId?._id?.toString() || s.batchId?.toString();
                if (currentBatchId === batchId) {
                    error = 'Student with this USN is already registered in this batch';
                } else {
                    error = `Already registered in: ${s.collegeId?.name || 'Unknown College'} (${s.batchId?.batchName || 'Unknown Batch'})`;
                }
                originalError = error;
            }

            return {
                name: row.name,
                usn: row.usn,
                mobile: row.mobile,
                email: row.email,
                semester: row.semester,
                department: row.department,
                division: row.division,
                cgpa: row.cgpa || 0,
                backlogs: row.backlogs || 0,
                error,
                originalUsn: row.usn,
                originalError
            };
        });

        res.json({
            success: true,
            data: students
        });
    } catch (error) {
        console.error('Excel parse error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Import students from a validated list
// @route   POST /api/admin/batches/:batchId/students/import-list
exports.importStudentsList = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { students } = req.body;

        if (!Array.isArray(students)) {
            return res.status(400).json({ success: false, error: 'Students list must be an array' });
        }

        // Verify the batch exists
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to import students for this batch' });
            }
        }

        const results = { created: 0, skipped: 0, errors: [] };

        for (const stud of students) {
            try {
                if (!stud.name || !stud.usn) {
                    results.errors.push({ usn: stud.usn || 'N/A', error: 'Name and USN are required' });
                    results.skipped++;
                    continue;
                }

                const normalizedUsn = stud.usn.trim().toUpperCase();

                const existingStudent = await Student.findOne({ usn: normalizedUsn, collegeId: batch.collegeId });
                if (existingStudent) {
                    results.errors.push({ usn: normalizedUsn, error: 'USN already registered in database' });
                    results.skipped++;
                    continue;
                }

                await Student.create({
                    batchId,
                    collegeId: batch.collegeId,
                    name: stud.name.trim(),
                    usn: normalizedUsn,
                    mobile: stud.mobile ? stud.mobile.trim() : undefined,
                    email: stud.email ? stud.email.trim() : undefined,
                    semester: stud.semester ? stud.semester.toString().trim() : undefined,
                    department: stud.department ? stud.department.trim() : undefined,
                    division: stud.division ? stud.division.trim() : undefined,
                    cgpa: parseFloat(stud.cgpa || 0),
                    backlogs: parseInt(stud.backlogs || 0)
                });

                results.created++;
            } catch (err) {
                results.errors.push({ usn: stud.usn || 'N/A', error: err.message });
                results.skipped++;
            }
        }

        // Update the batch student count
        const totalStudents = await Student.countDocuments({ batchId, status: 'active' });
        batch.studentCount = totalStudents;
        await batch.save();

        await logAudit(req, 'IMPORT_STUDENTS_LIST', 'Batch', batch._id, batch.batchName,
            { created: results.created, skipped: results.skipped });

        res.json({
            success: true,
            message: `Import complete: ${results.created} created, ${results.skipped} skipped.`,
            data: results
        });
    } catch (error) {
        console.error('Students list import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Download Excel import template
// @route   GET /api/admin/batches/:batchId/students/template
exports.downloadTemplate = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Students');

        // Define columns
        sheet.columns = [
            { header: 'Name', key: 'name', width: 25 },
            { header: 'USN', key: 'usn', width: 18 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Semester', key: 'semester', width: 12 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Division', key: 'division', width: 10 },
            { header: 'CGPA', key: 'cgpa', width: 10 },
            { header: 'Backlogs', key: 'backlogs', width: 10 }
        ];

        // Style header row
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' }
        };
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        // Add 2 sample rows
        sheet.addRow({
            name: 'Akhil Sharma', usn: '1CIT22CS001', mobile: '9876543210',
            email: 'akhil@gmail.com', semester: '6', department: 'CSE', division: 'A',
            cgpa: '8.5', backlogs: '0'
        });
        sheet.addRow({
            name: 'Neha Gupta', usn: '1CIT22CS002', mobile: '9876543211',
            email: 'neha@gmail.com', semester: '6', department: 'CSE', division: 'B',
            cgpa: '7.8', backlogs: '1'
        });

        const buffer = await workbook.xlsx.writeBuffer();

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="student_import_template.xlsx"',
            'Content-Length': buffer.length
        });
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update a student record
// @route   PUT /api/admin/batches/:batchId/students/:studentId
exports.updateStudent = async (req, res) => {
    try {
        const student = await Student.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const batch = await Batch.findById(student.batchId);
            if (!batch) {
                return res.status(404).json({ success: false, error: 'Batch not found for student' });
            }
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to update students for this batch' });
            }
        }

        const { name, usn, mobile, email, semester, department, division, status, cgpa, backlogs } = req.body;

        if (name) student.name = name;
        if (usn) student.usn = usn;
        if (mobile !== undefined) student.mobile = mobile;
        if (email !== undefined) student.email = email;
        if (semester !== undefined) student.semester = semester;
        if (department !== undefined) student.department = department;
        if (division !== undefined) student.division = division;
        if (status) student.status = status;
        if (cgpa !== undefined) student.cgpa = cgpa;
        if (backlogs !== undefined) student.backlogs = backlogs;

        await student.save();

        // Update batch student count if status changed
        if (status) {
            const totalStudents = await Student.countDocuments({ batchId: student.batchId, status: 'active' });
            await Batch.findByIdAndUpdate(student.batchId, { studentCount: totalStudents });
        }

        res.json({ success: true, data: student });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete a student from a batch
// @route   DELETE /api/admin/batches/:batchId/students/:studentId
exports.deleteStudent = async (req, res) => {
    try {
        const student = await Student.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const batchId = student.batchId;
        await student.deleteOne();

        // Update batch student count
        const totalStudents = await Student.countDocuments({ batchId, status: 'active' });
        await Batch.findByIdAndUpdate(batchId, { studentCount: totalStudents });

        res.json({ success: true, message: 'Student removed from batch' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Add a student manually
// @route   POST /api/admin/batches/:batchId/students
// @access  Private (Admin)
exports.createStudent = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ success: false, error: 'Batch not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to add students to this batch' });
            }
        }

        const { name, usn, mobile, email, semester, department, division, cgpa, backlogs } = req.body;

        if (!name || !usn) {
            return res.status(400).json({ success: false, error: 'Name and USN are required' });
        }

        // Check if USN exists
        const existingStudent = await Student.findOne({ usn, collegeId: batch.collegeId });
        if (existingStudent) {
            return res.status(400).json({ success: false, error: `Student with USN ${usn} already exists` });
        }

        const student = await Student.create({
            batchId,
            collegeId: batch.collegeId,
            name,
            usn,
            mobile,
            email,
            semester,
            department,
            division,
            cgpa: cgpa || 0,
            backlogs: backlogs || 0
        });

        // Update student count
        const totalStudents = await Student.countDocuments({ batchId, status: 'active' });
        batch.studentCount = totalStudents;
        await batch.save();

        res.status(201).json({ success: true, data: student });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Reset student password (direct override)
// @route   POST /api/admin/batches/:batchId/students/:studentId/reset-password
exports.resetStudentPassword = async (req, res) => {
    try {
        const student = await Student.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        if (['trainer', 'regional_manager', 'asst_rm'].includes(req.user.role)) {
            const batch = await Batch.findById(student.batchId);
            if (!batch) {
                return res.status(404).json({ success: false, error: 'Batch not found for student' });
            }
            const collegesList = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map(c => c.toString()) : [])
            ];
            if (!collegesList.includes(batch.collegeId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to reset password for this student' });
            }
        }

        const { newPassword } = req.body;
        if (!newPassword || newPassword.trim().length < 4) {
            return res.status(400).json({ success: false, error: 'New password is required (min 4 characters)' });
        }

        student.password = newPassword;
        await student.save();

        await logAudit(req, 'RESET_STUDENT_PASSWORD', 'Student', student._id, student.name);

        res.json({ success: true, message: 'Student password reset successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Unified Search User across platform (Super/Ops Admin: entire project or college-scoped; Trainer: strictly batches scoped to trainer)
// @route   GET /api/admin/search-users
exports.searchPlatformUsers = async (req, res) => {
    try {
        const User = require('../models/User');
        const College = require('../models/College');
        const {
            q = '',
            type = 'all', // 'all' | 'students' | 'trainers' | 'staff'
            collegeId: queryCollegeId = '',
            batchId: queryBatchId = '',
            department = '',
            page = 1,
            limit = 40
        } = req.query;

        const role = req.user.role;
        const isFullGlobalAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin'].includes(role);
        const isTrainer = role === 'trainer';

        // 1. Determine allowed Colleges and Batches for this user
        let allowedCollegeIds = null; // null = unrestricted (entire project)
        let allowedBatchIds = null;   // null = all batches within allowed colleges

        if (isTrainer) {
            const trainerBatches = await Batch.find({ trainerId: req.user._id })
                .populate('collegeId', 'name code')
                .populate('courseId', 'name code program')
                .sort({ batchName: 1 })
                .lean();

            allowedBatchIds = trainerBatches.map((b) => b._id.toString());
            const trainerCollegeSet = new Set(
                trainerBatches.map((b) => (b.collegeId?._id || b.collegeId)?.toString()).filter(Boolean)
            );
            allowedCollegeIds = Array.from(trainerCollegeSet);
        } else if (role === 'college_admin') {
            allowedCollegeIds = req.user.collegeId ? [req.user.collegeId.toString()] : [];
        } else if (['regional_manager', 'asst_rm', 'placement'].includes(role)) {
            allowedCollegeIds = [
                ...(req.user.collegeId ? [req.user.collegeId.toString()] : []),
                ...(Array.isArray(req.user.assignedColleges) ? req.user.assignedColleges.map((c) => c.toString()) : [])
            ];
        }

        // Apply optional collegeId filter (e.g. when inside /college/:collegeId/search-user)
        let effectiveCollegeId = queryCollegeId && queryCollegeId !== 'all' ? queryCollegeId.toString() : '';
        if (effectiveCollegeId && allowedCollegeIds !== null && !allowedCollegeIds.includes(effectiveCollegeId)) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to search users in this college scope'
            });
        }

        // Fetch filter metadata (batches & colleges available in current scope)
        const batchFilterQuery = {};
        if (isTrainer) {
            batchFilterQuery.trainerId = req.user._id;
        }
        if (effectiveCollegeId) {
            batchFilterQuery.collegeId = effectiveCollegeId;
        } else if (allowedCollegeIds !== null) {
            batchFilterQuery.collegeId = { $in: allowedCollegeIds };
        }

        const scopedBatches = await Batch.find(batchFilterQuery)
            .populate('collegeId', 'name code')
            .populate('courseId', 'name code program')
            .populate('trainerId', 'firstName lastName employeeId phone')
            .sort({ batchName: 1 })
            .lean();

        const collegeFilterQuery = {};
        if (effectiveCollegeId) {
            collegeFilterQuery._id = effectiveCollegeId;
        } else if (allowedCollegeIds !== null) {
            collegeFilterQuery._id = { $in: allowedCollegeIds };
        }
        const scopedColleges = await College.find(collegeFilterQuery)
            .select('name code status')
            .sort({ name: 1 })
            .lean();

        // Build search regex
        const searchStr = q.trim();
        const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = searchStr ? new RegExp(escapedSearch, 'i') : null;

        // 2. Query Students
        let studentsList = [];
        let totalStudentsCount = 0;

        const shouldFetchStudents = type === 'all' || type === 'students' || isTrainer;
        if (shouldFetchStudents) {
            const studentQuery = {};

            if (isTrainer) {
                if (queryBatchId && queryBatchId !== 'all') {
                    if (!allowedBatchIds.includes(queryBatchId.toString())) {
                        return res.status(403).json({
                            success: false,
                            error: 'Not authorized to search students outside your assigned batches'
                        });
                    }
                    studentQuery.batchId = queryBatchId;
                } else {
                    studentQuery.batchId = { $in: allowedBatchIds };
                }
            } else {
                if (queryBatchId && queryBatchId !== 'all') {
                    studentQuery.batchId = queryBatchId;
                }
                if (effectiveCollegeId) {
                    studentQuery.collegeId = effectiveCollegeId;
                } else if (allowedCollegeIds !== null) {
                    studentQuery.collegeId = { $in: allowedCollegeIds };
                }
            }

            if (department && department !== 'all') {
                studentQuery.department = new RegExp(`^${department.trim()}$`, 'i');
            }

            if (regex) {
                studentQuery.$or = [
                    { name: regex },
                    { usn: regex },
                    { email: regex },
                    { mobile: regex },
                    { department: regex }
                ];
            }

            totalStudentsCount = await Student.countDocuments(studentQuery);
            const rawStudents = await Student.find(studentQuery)
                .populate({
                    path: 'batchId',
                    select: 'batchName department program courseId trainerId',
                    populate: [
                        { path: 'courseId', select: 'name code program' },
                        { path: 'trainerId', select: 'firstName lastName phone employeeId' }
                    ]
                })
                .populate('collegeId', 'name code')
                .sort({ updatedAt: -1, name: 1 })
                .limit(Number(limit) || 40)
                .lean();

            studentsList = rawStudents.map((s) => ({
                _id: s._id,
                entityType: 'student',
                name: s.name,
                identifier: s.usn,
                email: s.email || '',
                phone: s.mobile || '',
                role: 'student',
                roleLabel: 'Student',
                status: s.status || 'active',
                department: s.department || s.batchId?.department || '',
                semester: s.semester || '',
                division: s.division || '',
                cgpa: s.cgpa ?? 0,
                backlogs: s.backlogs ?? 0,
                collegeId: s.collegeId?._id || s.collegeId || null,
                collegeName: s.collegeId?.name || '—',
                collegeCode: s.collegeId?.code || '',
                batchId: s.batchId?._id || s.batchId || null,
                batchName: s.batchId?.batchName || '—',
                courseName: s.batchId?.courseId?.name || '',
                courseCode: s.batchId?.courseId?.code || '',
                program: s.batchId?.program || s.batchId?.courseId?.program || '',
                trainerName: s.batchId?.trainerId
                    ? `${s.batchId.trainerId.firstName || ''} ${s.batchId.trainerId.lastName || ''}`.trim()
                    : ''
            }));
        }

        // 3. Query Trainers & Staff (Only for Admins / Ops Admins — never for Trainers)
        let staffList = [];
        let totalTrainersCount = 0;
        let totalStaffCount = 0;

        if (!isTrainer) {
            const baseUserScope = {};
            if (effectiveCollegeId) {
                baseUserScope.$or = [
                    { collegeId: effectiveCollegeId },
                    { assignedColleges: effectiveCollegeId }
                ];
            } else if (allowedCollegeIds !== null) {
                baseUserScope.$or = [
                    { collegeId: { $in: allowedCollegeIds } },
                    { assignedColleges: { $in: allowedCollegeIds } }
                ];
            }

            // Count trainers & staff in scope
            totalTrainersCount = await User.countDocuments({ ...baseUserScope, role: 'trainer' });
            if (isFullGlobalAdmin) {
                totalStaffCount = await User.countDocuments({
                    ...baseUserScope,
                    role: { $in: ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin', 'placement'] }
                });
            }

            const shouldFetchUsers = type === 'all' || type === 'trainers' || type === 'staff';
            if (shouldFetchUsers) {
                const userQuery = { $and: [] };
                if (Object.keys(baseUserScope).length > 0) {
                    userQuery.$and.push(baseUserScope);
                }

                if (type === 'trainers') {
                    userQuery.$and.push({ role: 'trainer' });
                } else if (type === 'staff') {
                    userQuery.$and.push({
                        role: { $in: ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin', 'placement'] }
                    });
                } else {
                    userQuery.$and.push({
                        role: isFullGlobalAdmin
                            ? { $in: ['trainer', 'super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin', 'placement'] }
                            : 'trainer'
                    });
                }

                if (regex) {
                    userQuery.$and.push({
                        $or: [
                            { firstName: regex },
                            { lastName: regex },
                            { email: regex },
                            { phone: regex },
                            { employeeId: regex },
                            { username: regex }
                        ]
                    });
                }

                const finalUserFilter = userQuery.$and.length > 0 ? userQuery : {};
                const rawUsers = await User.find(finalUserFilter)
                    .populate('collegeId', 'name code')
                    .populate('assignedColleges', 'name code')
                    .populate('assignedCourses', 'name code program')
                    .sort({ role: 1, firstName: 1 })
                    .limit(25)
                    .lean();

                const ROLE_LABELS = {
                    super_admin: 'Super Admin',
                    ops_admin: 'Ops Admin',
                    ast_ops_admin: 'Asst Ops Admin',
                    regional_manager: 'Regional Manager',
                    asst_rm: 'Asst Regional Manager',
                    college_admin: 'College Admin',
                    placement: 'Placement Officer',
                    trainer: 'Trainer'
                };

                const scopedCollegeObj = effectiveCollegeId
                    ? scopedColleges.find((c) => c._id.toString() === effectiveCollegeId.toString())
                    : null;

                staffList = rawUsers.map((u) => {
                    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.email || 'User';
                    const primaryCollege = u.collegeId;
                    const extraColleges = Array.isArray(u.assignedColleges) ? u.assignedColleges : [];
                    const allCollegesMap = new Map();
                    if (primaryCollege?._id) allCollegesMap.set(primaryCollege._id.toString(), primaryCollege);
                    extraColleges.forEach((c) => {
                        if (c?._id) allCollegesMap.set(c._id.toString(), c);
                    });
                    const mappedColleges = Array.from(allCollegesMap.values());

                    const displayCollege = scopedCollegeObj
                        ? scopedCollegeObj
                        : primaryCollege || mappedColleges[0] || null;

                    return {
                        _id: u._id,
                        entityType: u.role === 'trainer' ? 'trainer' : 'staff',
                        name: fullName,
                        identifier: u.employeeId || u.email || u.phone || u.username || '—',
                        email: u.email || '',
                        phone: u.phone || '',
                        employeeId: u.employeeId || '',
                        role: u.role,
                        roleLabel: ROLE_LABELS[u.role] || u.role,
                        status: u.isActive !== false ? 'active' : 'inactive',
                        program: u.program || '',
                        collegeId: displayCollege?._id || null,
                        collegeName: scopedCollegeObj
                            ? scopedCollegeObj.name
                            : (primaryCollege?.name || mappedColleges.map((c) => c.name).join(', ') || 'All Colleges'),
                        collegeCode: displayCollege?.code || '',
                        assignedColleges: mappedColleges.map((c) => ({ _id: c._id, name: c.name, code: c.code })),
                        assignedCourses: (u.assignedCourses || []).map((c) => ({
                            _id: c._id,
                            name: c.name,
                            code: c.code,
                            program: c.program
                        })),
                        lastLogin: u.lastLogin || null
                    };
                });
            }
        }

        res.json({
            success: true,
            scope: {
                mode: isTrainer ? 'trainer_batches' : (effectiveCollegeId ? 'college_scoped' : 'entire_project'),
                role,
                effectiveCollegeId: effectiveCollegeId || null,
                batchesCount: scopedBatches.length,
                collegesCount: scopedColleges.length
            },
            counts: {
                students: totalStudentsCount,
                trainers: totalTrainersCount,
                staff: totalStaffCount
            },
            filters: {
                colleges: scopedColleges,
                batches: scopedBatches.map((b) => ({
                    _id: b._id,
                    batchName: b.batchName,
                    department: b.department,
                    collegeId: b.collegeId?._id || b.collegeId,
                    collegeName: b.collegeId?.name || '',
                    collegeCode: b.collegeId?.code || '',
                    courseName: b.courseId?.name || '',
                    courseCode: b.courseId?.code || ''
                }))
            },
            data: {
                students: studentsList,
                users: staffList
            }
        });
    } catch (error) {
        console.error('searchPlatformUsers error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get 360-degree user profile (Student or Trainer/Staff) respecting caller's role scope
// @route   GET /api/admin/search-users/:entityType/:id
exports.getUser360Profile = async (req, res) => {
    try {
        const { entityType, id } = req.params;
        const User = require('../models/User');
        const StudentAttempt = require('../models/StudentAttempt');
        const AttendanceSession = require('../models/AttendanceSession');
        const TrainingLog = require('../models/TrainingLog');

        const role = req.user.role;
        const isTrainer = role === 'trainer';

        if (entityType === 'student') {
            const student = await Student.findById(id)
                .populate({
                    path: 'batchId',
                    select: 'batchName department program startDate endDate courseId trainerId',
                    populate: [
                        { path: 'courseId', select: 'name code program modulesCount' },
                        { path: 'trainerId', select: 'firstName lastName phone email employeeId' }
                    ]
                })
                .populate('collegeId', 'name code contactEmail contactPhone')
                .lean();

            if (!student) {
                return res.status(404).json({ success: false, error: 'Student not found' });
            }

            // Enforce Trainer batch scoping
            if (isTrainer) {
                const trainerBatch = await Batch.findOne({
                    _id: student.batchId?._id || student.batchId,
                    trainerId: req.user._id
                }).lean();
                if (!trainerBatch) {
                    return res.status(403).json({
                        success: false,
                        error: 'Not authorized to view a student outside your assigned batches'
                    });
                }
            }

            // Fetch exam attempts for this student's USN
            const usnRegex = new RegExp(`^${(student.usn || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            const attempts = await StudentAttempt.find({
                'studentDetails.rollNumber': usnRegex
            })
                .populate('examId', 'title totalMarks passingPercentage duration courseId')
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            // Fetch attendance stats for this student
            const attendanceSessions = await AttendanceSession.find({
                batchId: student.batchId?._id || student.batchId,
                'records.studentId': student._id
            })
                .select('date topic period module records')
                .sort({ date: -1 })
                .limit(30)
                .lean();

            let presentCount = 0;
            let absentCount = 0;
            const recentAttendance = attendanceSessions.map((sess) => {
                const rec = (sess.records || []).find((r) => r.studentId?.toString() === student._id.toString());
                const st = rec?.status || 'absent';
                if (st === 'present' || st === 'late') presentCount++;
                else absentCount++;
                return {
                    _id: sess._id,
                    date: sess.date,
                    topic: sess.topic,
                    period: sess.period,
                    module: sess.module,
                    status: st
                };
            });

            const totalMarked = presentCount + absentCount;
            const attendancePercentage = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

            const completedAttempts = attempts.filter((a) => a.status === 'completed');
            const avgScore =
                completedAttempts.length > 0
                    ? Number(
                          (
                              completedAttempts.reduce((acc, a) => acc + (a.percentage || 0), 0) /
                              completedAttempts.length
                          ).toFixed(1)
                      )
                    : 0;
            const passedCount = completedAttempts.filter((a) => a.result === 'pass').length;

            return res.json({
                success: true,
                data: {
                    entityType: 'student',
                    profile: student,
                    examSummary: {
                        totalAttempts: attempts.length,
                        completedAttempts: completedAttempts.length,
                        passedCount,
                        avgScore
                    },
                    attempts: attempts.map((a) => ({
                        _id: a._id,
                        examTitle: a.examId?.title || 'Assessment',
                        totalScore: a.totalScore,
                        totalMarks: a.examId?.totalMarks || 0,
                        percentage: Number((a.percentage || 0).toFixed(1)),
                        result: a.result,
                        status: a.status,
                        completedAt: a.completedAt || a.startedAt,
                        violationsCount:
                            (a.violations?.tabSwitches || 0) +
                            (a.violations?.fullScreenExits || 0) +
                            (a.violations?.copyAttempts || 0) +
                            (a.violations?.windowBlurs || 0)
                    })),
                    attendanceSummary: {
                        totalSessions: totalMarked,
                        presentCount,
                        absentCount,
                        percentage: attendancePercentage,
                        recentSessions: recentAttendance.slice(0, 8)
                    }
                }
            });
        }

        // Trainer or Staff profile (Admins only)
        if (isTrainer) {
            return res.status(403).json({
                success: false,
                error: 'Trainers can only inspect students in their assigned batches'
            });
        }

        const userDoc = await User.findById(id)
            .populate('collegeId', 'name code contactEmail')
            .populate('assignedColleges', 'name code')
            .populate('assignedCourses', 'name code program')
            .lean();

        if (!userDoc) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userBatches = await Batch.find({ trainerId: userDoc._id })
            .populate('collegeId', 'name code')
            .populate('courseId', 'name code program')
            .sort({ createdAt: -1 })
            .lean();

        const logsCount = await TrainingLog.countDocuments({ trainerId: userDoc._id });

        return res.json({
            success: true,
            data: {
                entityType: userDoc.role === 'trainer' ? 'trainer' : 'staff',
                profile: userDoc,
                batches: userBatches,
                trainingLogsCount: logsCount
            }
        });
    } catch (error) {
        console.error('getUser360Profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};



