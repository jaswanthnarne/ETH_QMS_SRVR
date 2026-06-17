const express = require('express');
const router = express.Router();
const { protect, authorize, protectStudent } = require('../middleware/authMiddleware');
const Job = require('../models/Job');
const JobApplication = require('../models/JobApplication');
const Student = require('../models/Student');
const Batch = require('../models/Batch');
const Course = require('../models/Course');
const User = require('../models/User');
const Exam = require('../models/Exam');
const StudentAttempt = require('../models/StudentAttempt');

// Helper to check if a user is any admin
const isAnyAdmin = (role) => {
    return ['super_admin', 'ops_admin', 'ast_ops_admin', 'regional_manager', 'asst_rm', 'college_admin'].includes(role);
};

// Helper to check if a placement officer is a global officer from Ethnotech
const isGlobalPlacement = (user) => {
    return user.role === 'placement' && (user.email?.endsWith('@ethnotech.com') || user.username === 'placement_officer');
};

// ==========================================
// PLACEMENT OFFICER / ADMIN ENDPOINTS
// ==========================================

// Get all jobs (Scoped by college for Placement Officer)
router.get('/jobs', protect, async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'placement') {
            query.collegeId = req.query.collegeId || req.user.collegeId;
        } else if (isAnyAdmin(req.user.role)) {
            // Admins see all or filter by college if query parameter is provided
            if (req.query.collegeId) {
                query.collegeId = req.query.collegeId;
            }
        } else {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const jobs = await Job.find(query)
            .populate('collegeId', 'name code')
            .populate('targetBatches', 'batchName department')
            .populate('examId', 'title duration totalMarks');

        res.json({ success: true, data: jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create a job posting
router.post('/jobs', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        const jobData = { ...req.body };

        // Force placement officer's college
        if (req.user.role === 'placement') {
            jobData.collegeId = req.body.collegeId || req.user.collegeId;
        }

        if (!jobData.collegeId) {
            return res.status(400).json({ success: false, error: 'College ID is required' });
        }

        const job = await Job.create(jobData);
        res.status(201).json({ success: true, data: job });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Update a job posting
router.put('/jobs/:id', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        let job = await Job.findById(req.id || req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job posting not found' });
        }

        // Check ownership
        if (req.user.role === 'placement' && !isGlobalPlacement(req.user) && req.user.collegeId && job.collegeId.toString() !== req.user.collegeId.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied to this college job' });
        }

        job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json({ success: true, data: job });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Delete a job posting
router.delete('/jobs/:id', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job posting not found' });
        }

        // Check ownership
        if (req.user.role === 'placement' && !isGlobalPlacement(req.user) && req.user.collegeId && job.collegeId.toString() !== req.user.collegeId.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied to this college job' });
        }

        await Job.findByIdAndDelete(req.params.id);
        // Also delete linked applications
        await JobApplication.deleteMany({ jobId: req.params.id });

        res.json({ success: true, message: 'Job posting and applications deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get batches of the placement officer's college
router.get('/batches', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'placement') {
            query.collegeId = req.query.collegeId || req.user.collegeId;
        } else if (req.query.collegeId) {
            query.collegeId = req.query.collegeId;
        }

        const batches = await Batch.find(query).select('batchName department collegeId');
        res.json({ success: true, data: batches });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get trainers of the placement officer's college
router.get('/trainers', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        let query = { role: 'trainer' };
        const targetCollegeId = req.query.collegeId || req.user.collegeId;
        if (req.user.role === 'placement') {
            query.$or = [
                { collegeId: targetCollegeId },
                { assignedColleges: targetCollegeId }
            ];
        } else if (req.query.collegeId) {
            query.$or = [
                { collegeId: req.query.collegeId },
                { assignedColleges: req.query.collegeId }
            ];
        }

        const trainers = await User.find(query).select('firstName lastName email phone isActive');
        res.json({ success: true, data: trainers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get exams of the placement officer's college (to link as screening test)
router.get('/exams', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'placement') {
            query.collegeId = req.query.collegeId || req.user.collegeId;
        } else if (req.query.collegeId) {
            query.collegeId = req.query.collegeId;
        }

        const exams = await Exam.find(query).select('title duration totalMarks passingPercentage isActive');
        res.json({ success: true, data: exams });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get students of the placement officer's college (with batches populated)
router.get('/students', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'placement') {
            query.collegeId = req.query.collegeId || req.user.collegeId;
        } else if (req.query.collegeId) {
            query.collegeId = req.query.collegeId;
        }

        const students = await Student.find(query)
            .populate('batchId', 'name code')
            .select('name usn email mobile department division cgpa backlogs status');

        res.json({ success: true, data: students });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get applicants for a specific job posting
router.get('/jobs/:jobId/applications', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job posting not found' });
        }

        // Check ownership
        if (req.user.role === 'placement' && !isGlobalPlacement(req.user) && req.user.collegeId && job.collegeId.toString() !== req.user.collegeId.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const applications = await JobApplication.find({ jobId: req.params.jobId })
            .populate({
                path: 'studentId',
                select: 'name usn email mobile department division cgpa backlogs resumeUrl',
                populate: { path: 'batchId', select: 'name code' }
            })
            .populate({
                path: 'attemptId',
                select: 'totalScore percentage result completedAt status'
            });

        res.json({ success: true, data: applications });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk update job applications status (Placement Officer / Admin review)
router.put('/applications/bulk-status', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        const { applicationIds, status, notes } = req.body;
        if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Application IDs array is required' });
        }
        if (!status) {
            return res.status(400).json({ success: false, error: 'Status is required' });
        }

        // Verify college ownership if placement officer (only update applications for jobs belonging to their college unless global)
        const apps = await JobApplication.find({ _id: { $in: applicationIds } }).populate('jobId');
        const allowedIds = [];
        
        for (const app of apps) {
            const isOwner = req.user.role !== 'placement' || isGlobalPlacement(req.user) || !req.user.collegeId || app.jobId.collegeId.toString() === req.user.collegeId.toString();
            if (isOwner) {
                allowedIds.push(app._id);
            }
        }

        if (allowedIds.length === 0) {
            return res.status(403).json({ success: false, error: 'Access denied to all selected applications' });
        }

        const updateData = { status };
        if (notes !== undefined) {
            updateData.notes = notes;
        }

        await JobApplication.updateMany({ _id: { $in: allowedIds } }, { $set: updateData });

        res.json({ 
            success: true, 
            message: `Successfully updated ${allowedIds.length} application(s) to ${status.replace('_', ' ')}` 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update job application status (Placement Officer / Admin review)
router.put('/applications/:id/status', protect, authorize('placement', 'super_admin', 'ops_admin', 'college_admin'), async (req, res) => {
    try {
        const app = await JobApplication.findById(req.params.id).populate('jobId');
        if (!app) {
            return res.status(404).json({ success: false, error: 'Job application not found' });
        }

        // Verify college ownership
        if (req.user.role === 'placement' && !isGlobalPlacement(req.user) && req.user.collegeId && app.jobId.collegeId.toString() !== req.user.collegeId.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        app.status = req.body.status;
        if (req.body.notes !== undefined) {
            app.notes = req.body.notes;
        }

        await app.save();
        res.json({ success: true, data: app });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==========================================
// STUDENT PLACEMENT BOARD ENDPOINTS
// ==========================================

// Get eligible job postings for the logged-in student
router.get('/student/jobs', protectStudent, async (req, res) => {
    try {
        const student = req.student;

        // Fetch all active jobs matching the student's college
        const jobs = await Job.find({
            collegeId: student.collegeId,
            isActive: true
        }).populate('examId', 'title duration totalMarks');

        // Fetch the student's existing applications
        const applications = await JobApplication.find({ studentId: student._id });
        const appliedJobIds = applications.map(a => a.jobId.toString());

        // Process jobs to add eligibility & applied flags
        const processedJobs = jobs.map(job => {
            const isApplied = appliedJobIds.includes(job._id.toString());
            const application = isApplied ? applications.find(a => a.jobId.toString() === job._id.toString()) : null;

            // Check eligibility rules
            const eligibility = {
                eligible: true,
                reasons: []
            };

            // Check target batches
            if (job.targetBatches && job.targetBatches.length > 0) {
                const isBatchTargeted = job.targetBatches.some(b => b.toString() === student.batchId.toString());
                if (!isBatchTargeted) {
                    eligibility.eligible = false;
                    eligibility.reasons.push("Your batch is not targeted for this job opportunity.");
                }
            }

            if (job.rules) {
                // Check CGPA
                if (job.rules.minCgpa !== null && job.rules.minCgpa !== undefined) {
                    if ((student.cgpa || 0) < job.rules.minCgpa) {
                        eligibility.eligible = false;
                        eligibility.reasons.push(`Minimum CGPA required is ${job.rules.minCgpa} (Your CGPA: ${student.cgpa || 0})`);
                    }
                }

                // Check Backlogs
                if (job.rules.maxBacklogs !== null && job.rules.maxBacklogs !== undefined) {
                    if ((student.backlogs || 0) > job.rules.maxBacklogs) {
                        eligibility.eligible = false;
                        eligibility.reasons.push(`Maximum allowed backlogs is ${job.rules.maxBacklogs} (Your backlogs: ${student.backlogs || 0})`);
                    }
                }

                // Check Department
                if (job.rules.allowedDepartments && job.rules.allowedDepartments.length > 0) {
                    const studentDeptNormalized = (student.department || '').trim().toLowerCase();
                    const isDeptAllowed = job.rules.allowedDepartments.some(
                        dept => dept.trim().toLowerCase() === studentDeptNormalized
                    );

                    if (!isDeptAllowed) {
                        eligibility.eligible = false;
                        eligibility.reasons.push(`Your department (${student.department || 'N/A'}) is not eligible. Allowed: ${job.rules.allowedDepartments.join(', ')}`);
                    }
                }
            }

            return {
                ...job.toObject(),
                isApplied,
                applicationStatus: application ? application.status : null,
                applicationId: application ? application._id : null,
                eligibility
            };
        });

        res.json({ success: true, data: processedJobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Apply for a job posting
router.post('/student/jobs/:id/apply', protectStudent, async (req, res) => {
    try {
        const student = req.student;
        const job = await Job.findById(req.params.id);

        if (!job || !job.isActive) {
            return res.status(404).json({ success: false, error: 'Active job posting not found' });
        }

        // Verify college/batch alignment
        if (job.collegeId.toString() !== student.collegeId.toString()) {
            return res.status(403).json({ success: false, error: 'This job is not open to your college' });
        }
        if (!job.targetBatches.includes(student.batchId)) {
            return res.status(403).json({ success: false, error: 'This job is not open to your batch' });
        }

        // Check if already applied
        const existingApp = await JobApplication.findOne({ jobId: job._id, studentId: student._id });
        if (existingApp) {
            return res.status(400).json({ success: false, error: 'You have already applied for this job' });
        }

        // Check eligibility rules
        if (job.rules) {
            if (job.rules.minCgpa !== null && (student.cgpa || 0) < job.rules.minCgpa) {
                return res.status(400).json({ success: false, error: `Minimum CGPA of ${job.rules.minCgpa} required.` });
            }
            if (job.rules.maxBacklogs !== null && (student.backlogs || 0) > job.rules.maxBacklogs) {
                return res.status(400).json({ success: false, error: `Maximum backlogs allowed is ${job.rules.maxBacklogs}.` });
            }
            if (job.rules.allowedDepartments && job.rules.allowedDepartments.length > 0) {
                const studentDeptNormalized = (student.department || '').trim().toLowerCase();
                const isDeptAllowed = job.rules.allowedDepartments.some(
                    dept => dept.trim().toLowerCase() === studentDeptNormalized
                );
                if (!isDeptAllowed) {
                    return res.status(400).json({ success: false, error: `Department not eligible.` });
                }
            }
        }

        // Create Application
        const application = await JobApplication.create({
            jobId: job._id,
            studentId: student._id,
            status: 'applied'
        });

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            data: {
                applicationId: application._id,
                requiresExam: !!job.examId,
                examId: job.examId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
