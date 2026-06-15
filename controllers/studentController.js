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

            if (!name) {
                results.errors.push({ row: rowNumber, error: 'Student name is required' });
                return;
            }
            if (!usn) {
                results.errors.push({ row: rowNumber, error: 'USN is required' });
                return;
            }

            rows.push({ name, usn, mobile, email, semester, department, division, rowNumber });
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
                        division: row.division
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
                    division: stud.division ? stud.division.trim() : undefined
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
            { header: 'Division', key: 'division', width: 10 }
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
            email: 'akhil@gmail.com', semester: '6', department: 'CSE', division: 'A'
        });
        sheet.addRow({
            name: 'Neha Gupta', usn: '1CIT22CS002', mobile: '9876543211',
            email: 'neha@gmail.com', semester: '6', department: 'CSE', division: 'B'
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

        const { name, usn, mobile, email, semester, department, division, status } = req.body;

        if (name) student.name = name;
        if (usn) student.usn = usn;
        if (mobile !== undefined) student.mobile = mobile;
        if (email !== undefined) student.email = email;
        if (semester !== undefined) student.semester = semester;
        if (department !== undefined) student.department = department;
        if (division !== undefined) student.division = division;
        if (status) student.status = status;

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

        const { name, usn, mobile, email, semester, department, division } = req.body;

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
            division
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
