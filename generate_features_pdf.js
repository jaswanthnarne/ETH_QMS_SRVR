const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// Ethnotech Academy — Role Privileges & Features Guide (v3 — Rebuilt)
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
    navy:       '#004AAD',
    darkNavy:   '#003580',
    deepNavy:   '#002255',
    slate900:   '#0F172A',
    slate800:   '#1E293B',
    slate700:   '#334155',
    slate600:   '#475569',
    slate500:   '#64748B',
    slate400:   '#94A3B8',
    slate300:   '#CBD5E1',
    slate200:   '#E2E8F0',
    slate100:   '#F1F5F9',
    slate50:    '#F8FAFC',
    white:      '#FFFFFF',
    green600:   '#059669',
    green100:   '#D1FAE5',
    green50:    '#ECFDF5',
    green800:   '#065F46',
    red100:     '#FEE2E2',
    red600:     '#DC2626',
    red800:     '#991B1B',
    amber50:    '#FFFBEB',
    amber100:   '#FEF3C7',
    amber600:   '#D97706',
    amber800:   '#92400E',
    indigo50:   '#EEF2FF',
    indigo600:  '#4F46E5',
    indigo800:  '#3730A3',
    purple50:   '#F5F3FF',
    purple600:  '#9333EA',
    purple800:  '#5B21B6',
    blue50:     '#EFF6FF',
    blue600:    '#2563EB',
    blue800:    '#1E40AF',
};

const PW = 595.28;
const PH = 841.89;
const M  = 50;       // margin
const CW = PW - M*2; // content width

// ─── Create document ─────────────────────────────────────────────────────────
const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
        Title: 'Ethnotech Academy — Role Privileges & Features Guide',
        Author: 'Ethnotech Academy',
        Subject: 'RBAC Documentation',
    }
});

const outputPath = path.join('d:', 'Eth_Quiz_New', 'Ethnotech_Role_Privileges.pdf');
doc.pipe(fs.createWriteStream(outputPath));

// ─── Utility: safe page break ────────────────────────────────────────────────
function needsBreak(spaceNeeded) {
    return doc.y + spaceNeeded > PH - 55;
}

// ─── Utility: draw a filled circle (for table symbols) ───────────────────────
function drawDot(x, y, r, color) {
    doc.circle(x, y, r).fill(color);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 1 — COVER
// ═══════════════════════════════════════════════════════════════════════════════

// Navy fill
doc.rect(0, 0, PW, PH).fill(C.navy);

// Top thin white line accent
doc.rect(0, 0, PW, 3).fill(C.white);

// Left vertical accent stripe
doc.rect(M - 8, M + 40, 4, 260).fill(C.green600);

// Small top label
doc.fillColor(C.white).opacity(0.5)
   .fontSize(9).font('Helvetica-Bold')
   .text('ETHNOTECH ACADEMY', M, M + 20);
doc.opacity(1);

doc.fillColor(C.white).opacity(0.35)
   .fontSize(8).font('Helvetica')
   .text('Assessment Management Platform', M, M + 34);
doc.opacity(1);

// Main Title
doc.fillColor(C.white)
   .fontSize(38).font('Helvetica-Bold')
   .text('Role Privileges', M, 180);

doc.fillColor(C.white)
   .fontSize(38).font('Helvetica-Bold')
   .text('& Features Guide', M, 225);

// Green accent line below title
doc.rect(M, 275, 80, 3).fill(C.green600);

// Subtitle
doc.fillColor(C.white).opacity(0.7)
   .fontSize(11).font('Helvetica')
   .text('Comprehensive documentation of access control, scope boundaries,', M, 300)
   .text('feature permissions, and comparative privilege analysis.', M, 315);
doc.opacity(1);

// Role shortcodes row
const codes = [
    { code: 'SA', label: 'Super Admin' },
    { code: 'OA', label: 'Ops Admin' },
    { code: 'AOA', label: 'Asst Ops' },
    { code: 'RM', label: 'Regional Mgr' },
    { code: 'ARM', label: 'Asst RM' },
    { code: 'CA', label: 'College Admin' },
    { code: 'TR', label: 'Trainer' },
    { code: 'ST', label: 'Student' },
];

const codeY = 380;
codes.forEach((c, i) => {
    const cx = M + i * 58;
    doc.roundedRect(cx, codeY, 50, 40, 5).fill('#FFFFFF15');
    doc.fillColor(C.white)
       .fontSize(11).font('Helvetica-Bold')
       .text(c.code, cx, codeY + 6, { width: 50, align: 'center' });
    doc.fillColor(C.white).opacity(0.45)
       .fontSize(5.5).font('Helvetica')
       .text(c.label, cx, codeY + 24, { width: 50, align: 'center' });
    doc.opacity(1);
});

// Document meta box
const metaY = 520;
doc.roundedRect(M, metaY, CW, 130, 6).lineWidth(0.8).stroke('#FFFFFF20');

doc.fillColor(C.white).opacity(0.55)
   .fontSize(7.5).font('Helvetica-Bold')
   .text('DOCUMENT DETAILS', M + 16, metaY + 14);
doc.opacity(1);

doc.moveTo(M + 16, metaY + 28).lineTo(M + CW - 16, metaY + 28).lineWidth(0.4).stroke('#FFFFFF15');

const metaRows = [
    ['Document Type', 'Internal Administrative Reference'],
    ['Version', '3.0 — June 2026'],
    ['Classification', 'Confidential — Internal Use Only'],
    ['Roles Covered', '8 roles (Super Admin through Student)'],
    ['Sections', 'Role Profiles, Comparison Matrix, Scope Hierarchy'],
    ['Maintained By', 'Ethnotech Academy Platform Team'],
];
metaRows.forEach((r, i) => {
    const ry = metaY + 38 + i * 14;
    doc.fillColor(C.white).opacity(0.5).fontSize(7.5).font('Helvetica-Bold').text(r[0], M + 20, ry);
    doc.opacity(1);
    doc.fillColor(C.white).opacity(0.75).fontSize(7.5).font('Helvetica').text(r[1], M + 180, ry);
    doc.opacity(1);
});

// Bottom bar
doc.fillColor(C.white).opacity(0.3)
   .fontSize(7).font('Helvetica')
   .text('(c) 2026 Ethnotech Academy. All rights reserved.', M, PH - 45, { width: CW, align: 'center' });
doc.opacity(1);

doc.rect(0, PH - 3, PW, 3).fill(C.white);


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 2 — TABLE OF CONTENTS
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(22).font('Helvetica-Bold').text('Table of Contents', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Navigate through role documentation, comparison matrices, and reference appendices.', M, doc.y, { width: CW });
doc.moveDown(1);

// Divider
doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

const toc = [
    { n: '01', t: 'Cover Page', d: 'Document identity, classification and role summary', p: '1' },
    { n: '02', t: 'Table of Contents', d: 'Section index and navigation', p: '2' },
    { n: '03', t: 'Executive Summary', d: 'RBAC architecture overview and scope model', p: '3' },
    { n: '04', t: 'Role Profiles', d: 'Detailed feature cards for all 8 platform roles', p: '4-7' },
    { n: '05', t: 'Comparative Permissions Matrix', d: 'Side-by-side feature access grid across roles', p: '8' },
    { n: '06', t: 'Scope Hierarchy Diagram', d: 'Visual representation of access boundaries', p: '9' },
    { n: '07', t: 'Closing & Contact', d: 'Support information and confidentiality notice', p: '10' },
];

toc.forEach(e => {
    const ey = doc.y;
    // Number
    doc.roundedRect(M, ey, 26, 26, 3).fill(C.slate100);
    doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
       .text(e.n, M, ey + 7, { width: 26, align: 'center' });
    // Title + desc
    doc.fillColor(C.slate800).fontSize(10).font('Helvetica-Bold').text(e.t, M + 36, ey + 3);
    doc.fillColor(C.slate500).fontSize(7.5).font('Helvetica').text(e.d, M + 36, ey + 16);
    // Page
    doc.fillColor(C.slate400).fontSize(9).font('Helvetica-Bold')
       .text(e.p, PW - M - 30, ey + 7, { width: 30, align: 'right' });

    // Dotted line
    doc.moveTo(M + 36 + doc.widthOfString(e.t, {font: 'Helvetica-Bold', size:10}) + 8, ey + 10)
       .lineTo(PW - M - 35, ey + 10)
       .lineWidth(0.3)
       .dash(2, { space: 2 })
       .stroke(C.slate300);
    doc.undash();

    doc.y = ey + 36;
});


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 3 — EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(22).font('Helvetica-Bold').text('Executive Summary', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Architecture overview and security model of the Ethnotech Academy assessment platform.', M, doc.y, {width: CW});
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

// RBAC card
let cy = doc.y;
doc.rect(M, cy, CW, 85).fill(C.slate50);
doc.rect(M, cy, 4, 85).fill(C.navy);

doc.fillColor(C.navy).fontSize(12).font('Helvetica-Bold')
   .text('Role-Based Access Control (RBAC)', M + 14, cy + 10);
doc.fillColor(C.slate700).fontSize(8).font('Helvetica')
   .text(
       'The Ethnotech Academy platform implements a hierarchical RBAC model with 8 distinct roles. Each role is assigned a specific scope that determines the data boundaries and actions available. Scopes range from Global (full system access) to Regional (assigned colleges) to Institutional (single college) to Classroom (trainer batches) to Portal-Only (student testing interface). All restrictions are enforced at both the API routing layer (server-side middleware) and the frontend UI layer (conditional rendering and navigation protection).',
       M + 14, cy + 28, { width: CW - 28, lineGap: 2 }
   );

doc.y = cy + 95;
doc.moveDown(0.5);

// Scope tiers
doc.fillColor(C.slate800).fontSize(12).font('Helvetica-Bold').text('Scope Tiers', M);
doc.moveDown(0.5);

const tiers = [
    { tier: 'Global',        roles: 'Super Admin, Ops Admin, Asst Ops Admin',  desc: 'Unrestricted access across all institutions, users, and resources.',           bg: '#FEE2E2', tc: '#991B1B' },
    { tier: 'Regional',      roles: 'Regional Manager, Asst Regional Manager', desc: 'Access restricted to a defined list of assigned colleges.',                    bg: C.green100, tc: C.green800 },
    { tier: 'Institutional', roles: 'College Admin',                            desc: 'Complete authority within a single college. No cross-institution visibility.', bg: '#DBEAFE', tc: C.blue800 },
    { tier: 'Classroom',     roles: 'Trainer',                                  desc: 'Limited to mapped batches and courses. Can create exams and proctor.',         bg: C.amber100, tc: C.amber800 },
    { tier: 'Portal',        roles: 'Student',                                  desc: 'Student-facing assessment portal. Take exams and view personal data only.',    bg: C.slate100, tc: C.slate800 },
];

tiers.forEach(t => {
    const ty = doc.y;
    doc.rect(M, ty, CW, 42).fill(C.white);
    doc.rect(M, ty, CW, 42).lineWidth(0.4).stroke(C.slate200);

    // Badge
    doc.roundedRect(M + 8, ty + 6, 68, 16, 3).fill(t.bg);
    doc.fillColor(t.tc).fontSize(7.5).font('Helvetica-Bold')
       .text(t.tier, M + 8, ty + 10, { width: 68, align: 'center' });

    // Desc
    doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
       .text(t.desc, M + 86, ty + 9, { width: CW - 100 });

    // Roles
    doc.fillColor(C.slate500).fontSize(7).font('Helvetica-Bold')
       .text('Roles: ' + t.roles, M + 86, ty + 25, { width: CW - 100 });

    doc.y = ty + 48;
});

// Enforcement note
doc.moveDown(0.5);
cy = doc.y;
doc.rect(M, cy, CW, 40).fill(C.amber50);
doc.rect(M, cy, 4, 40).fill(C.amber600);
doc.fillColor(C.amber800).fontSize(8).font('Helvetica-Bold')
   .text('Security Enforcement Note', M + 14, cy + 8);
doc.fillColor(C.amber800).fontSize(7.5).font('Helvetica')
   .text('All role restrictions are enforced at both the API routing layer (server-side middleware guards returning HTTP 403) and the frontend UI layer (conditional rendering and navigation protection). Direct API bypass attempts are blocked.', M + 14, cy + 20, { width: CW - 28, lineGap: 1 });


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGES 4-7 — ROLE PROFILES (dynamic height, 2 per page when they fit)
// ═══════════════════════════════════════════════════════════════════════════════

const roles = [
    {
        role: 'Super Admin', code: 'SA', scope: 'Global System Owner',
        accent: '#DC2626',
        desc: 'Holds root privileges over the entire Ethnotech ecosystem. Responsible for strategic management, server-wide configurations, master entity provisioning, and full audit oversight.',
        features: [
            ['Institutions', 'Create, edit, upload logos, and delete college profiles. View and manage all institution dashboards globally.'],
            ['User Management', 'Full CRUD on all admin, trainer, and student accounts. Provision Ops Admins, Regional Managers, and College Admins. Reset credentials and modify role assignments.'],
            ['Curriculum', 'Create and organize global courses and syllabus PDFs. Manage master question banks with bulk import/export. Clone and distribute exams across institutions.'],
            ['Reporting & Audit', 'Export cross-institution master performance reports. Access complete system-wide audit trail. View integrity violation analytics and proctoring logs.'],
        ],
        restrictions: 'None — possesses unrestricted root-level privileges across the entire platform.',
    },
    {
        role: 'Operations Admin', code: 'OA', scope: 'Global Read-Write Operator',
        accent: '#4F46E5',
        desc: 'Responsible for day-to-day operational execution across all colleges. Handles administrative provisioning, scheduling, and cross-institution quality oversight.',
        features: [
            ['Administrative Control', 'Global read-write access to courses, trainers, batches, and exams. Manage allotment configurations and access key distribution.'],
            ['Account Provisioning', 'Create and manage Regional Managers, College Admins, and Trainers. Modify user assignments and batch mappings.'],
            ['Reporting', 'View cross-college statistics and analytics dashboards. Export trainer performance and student result reports. Access complete audit logs.'],
            ['Integrity Controls', 'Manage master question bank and proctoring settings. Review tab-switch and copy-paste violation logs.'],
        ],
        restrictions: 'Cannot delete colleges or modify Super Admin security settings.',
    },
    {
        role: 'Assistant Operations Admin', code: 'AOA', scope: 'Global Read-Write Assistant',
        accent: '#9333EA',
        desc: 'Supports Operations Admins with scheduling, logistical coordination, and monitoring across the full network of partner institutions.',
        features: [
            ['Allotment Operations', 'Assist in creating batches, assigning trainers, and scheduling exams. Manage student rosters and Excel imports.'],
            ['Monitoring', 'Check live exam progress and student proctoring metrics. Review trainer compliance and classroom progress logs.'],
            ['Analytical Access', 'View performance metrics and export student results. Access attendance registers and training log reports.'],
        ],
        restrictions: 'Cannot delete colleges, courses, or batches. Cannot manage user credentials or modify system-level settings.',
    },
    {
        role: 'Regional Manager', code: 'RM', scope: 'Scoped to Assigned Colleges',
        accent: '#059669',
        desc: 'Manages and monitors operations for a specific geographic region. Permissions are strictly restricted to a defined list of assigned colleges stored in their user profile.',
        features: [
            ['Local Management', 'Scoped read-write access to batches, course maps, and trainers for assigned colleges. Create and manage student rosters within assigned scope.'],
            ['Assessments', 'Create and edit exams, configure allotments, and distribute access keys. Monitor live exam sessions within assigned colleges.'],
            ['Supervision', 'Verify trainer training logs, class locations, and syllabus coverage. Review student attendance history and compliance dashboards.'],
            ['Reporting', 'Export college-scoped performance and attendance reports. View analytics dashboards filtered to assigned colleges.'],
        ],
        restrictions: 'Cannot access unassigned colleges. Blocked from system-wide deletion rights and global admin account creation.',
    },
    {
        role: 'Assistant Regional Manager', code: 'ARM', scope: 'Scoped to Assigned Colleges',
        accent: '#059669',
        desc: 'Assists the Regional Manager in monitoring local batches, reviewing training logs, and ensuring operational readiness within assigned colleges.',
        features: [
            ['Scoped Tracking', 'Create exams, batch listings, and student profiles for assigned colleges. Manage allotment configurations within scope.'],
            ['Reporting', 'View performance logs and scoped analytics for assigned colleges. Export attendance and student result reports.'],
            ['Access Keys', 'Retrieve and verify student exam access keys. Monitor allotment status and key distribution.'],
        ],
        restrictions: 'Strictly scoped to assigned colleges list. Cannot manage core admin user accounts or modify global settings.',
    },
    {
        role: 'College Admin', code: 'CA', scope: 'Single Institution Owner',
        accent: '#2563EB',
        desc: 'Complete operational authority over a single college context. Manages all local resources including courses, trainers, batches, and students. Cannot view other institutions.',
        features: [
            ['Local Roster', 'Manage courses, batches, and student lists for their specific college. Upload college logos and edit institutional profile details.'],
            ['Assessment Mgmt', 'Manage local exams, configure allotments, and distribute access keys. Review cheating logs and proctoring violations.'],
            ['Compliance', 'Audit trainer training logs and verify class coverage. Review classroom attendance registers and export reports.'],
            ['Notifications', 'Receive real-time system notifications for exam starts and log submissions. Manage notification preferences and read status.'],
        ],
        restrictions: 'Cannot view other colleges, modify global course materials, or create admin-level accounts.',
    },
    {
        role: 'Trainer', code: 'TR', scope: 'Classroom Scoped Operator',
        accent: '#D97706',
        desc: 'Handles classroom delivery, live exam proctoring, student evaluation, and attendance marking for mapped batches and courses.',
        features: [
            ['Live Proctoring', 'Monitor live tests and review integrity metrics (tab switches, idle time). Authorize student exam entries and manage session controls.'],
            ['Attendance', 'Mark class-by-class student attendance with status codes (P/A/L/E). View historical attendance records and export registers.'],
            ['Training Logs', 'Submit training logs with topics covered, locations, and student details. Upload supplementary materials and session notes.'],
            ['Analytics', 'View personal exam performance analytics and student pass rates. Export individual exam and batch result reports.'],
        ],
        restrictions: 'Cannot manage other trainers, alter college settings, create global exams, or access administrative dashboards.',
    },
    {
        role: 'Student', code: 'ST', scope: 'Testing Portal Access Only',
        accent: '#64748B',
        desc: 'End-user assessment portal. Students access assigned examinations, view performance history, check attendance records, and manage personal tasks.',
        features: [
            ['Assessment Portal', 'Enter active access keys to take timed, proctored exams. Submit assessments with auto-save and integrity monitoring.'],
            ['Performance History', 'View chronological test results with scores and grading details. Review question-level performance and correct answers (if enabled).'],
            ['Attendance', 'Check personal attendance percentages and session history. View batch attendance details and session topics.'],
            ['Personal Mgmt', 'Manage to-do lists and task tracking. Update profile and account security settings (password change).'],
        ],
        restrictions: 'Has no access to administrative dashboards, trainer logs, course creation forms, or any management interfaces.',
    },
];

// ─── Draw a single role card, returns the Y after the card ───────────────────
function drawRoleCard(role) {
    const startY = doc.y;

    // Measure how tall this card will be
    const featureCount = role.features.length;
    const estimatedH = 24 + 26 + (featureCount * 30) + 30; // title + desc + features + restriction

    // Card bg
    doc.rect(M, startY, CW, estimatedH).fill(C.white);
    doc.rect(M, startY, CW, estimatedH).lineWidth(0.4).stroke(C.slate200);

    // Top accent bar
    doc.rect(M, startY, CW, 3).fill(role.accent);

    // Role name
    doc.fillColor(C.slate800).fontSize(13).font('Helvetica-Bold')
       .text(role.role, M + 12, startY + 12);

    // Code badge
    const nameW = doc.widthOfString(role.role, { font: 'Helvetica-Bold', size: 13 });
    doc.roundedRect(M + 16 + nameW, startY + 12, 28, 16, 3).fill(role.accent + '20');
    doc.fillColor(role.accent).fontSize(7.5).font('Helvetica-Bold')
       .text(role.code, M + 16 + nameW, startY + 16, { width: 28, align: 'center' });

    // Scope badge (right)
    const scopeStr = 'Scope: ' + role.scope;
    const scopeW = doc.widthOfString(scopeStr, { font: 'Helvetica-Bold', size: 7 }) + 12;
    doc.roundedRect(PW - M - scopeW - 10, startY + 12, scopeW, 16, 3).fill(C.green50);
    doc.fillColor(C.green800).fontSize(7).font('Helvetica-Bold')
       .text(scopeStr, PW - M - scopeW - 10, startY + 16, { width: scopeW, align: 'center' });

    // Description
    doc.fillColor(C.slate600).fontSize(7.5).font('Helvetica')
       .text(role.desc, M + 12, startY + 34, { width: CW - 24, lineGap: 1 });

    // Features — render dynamically
    let fy = startY + 60;
    // Measure desc height for adjustment
    const descH = doc.heightOfString(role.desc, { width: CW - 24, fontSize: 7.5, lineGap: 1 });
    fy = startY + 34 + descH + 10;

    role.features.forEach(([cat, detail]) => {
        // Category label
        doc.fillColor(C.navy).fontSize(7.5).font('Helvetica-Bold')
           .text(cat.toUpperCase(), M + 12, fy);

        // Detail text
        const detailH = doc.heightOfString(detail, { width: CW - 36, fontSize: 7, lineGap: 1 });
        doc.fillColor(C.slate700).fontSize(7).font('Helvetica')
           .text(detail, M + 12, fy + 11, { width: CW - 36, lineGap: 1 });

        fy += 11 + detailH + 8;
    });

    // Restriction bar
    fy += 2;
    doc.rect(M + 8, fy, CW - 16, 20).fill(C.amber50);
    doc.rect(M + 8, fy, 3, 20).fill(C.amber600);
    doc.fillColor(C.amber800).fontSize(6.5).font('Helvetica-Bold')
       .text('RESTRICTIONS: ', M + 18, fy + 5);
    const restrictLabelW = doc.widthOfString('RESTRICTIONS: ', { font: 'Helvetica-Bold', size: 6.5 });
    doc.fillColor(C.amber800).fontSize(6.5).font('Helvetica')
       .text(role.restrictions, M + 18 + restrictLabelW, fy + 5, { width: CW - 44 - restrictLabelW });

    fy += 28;

    // Redraw card border with actual height
    const actualH = fy - startY;
    // Overdraw bg (clear the initial estimated one)
    // Actually let's just set doc.y to the bottom
    doc.y = fy;

    return fy;
}

// Start role profiles section
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(22).font('Helvetica-Bold').text('Role Profiles', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Detailed feature documentation for each of the 8 platform roles.', M, doc.y, { width: CW });
doc.moveDown(0.6);
doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.6);

roles.forEach((role, idx) => {
    // Estimate card height
    let estH = 100;
    role.features.forEach(([, detail]) => {
        estH += 11 + doc.heightOfString(detail, { width: CW - 36, fontSize: 7, lineGap: 1 }) + 8;
    });
    estH += 40; // restriction bar + padding

    if (needsBreak(estH)) {
        doc.addPage();
        doc.y = 55;
    }

    drawRoleCard(role);
    doc.moveDown(0.4);
});


// ═══════════════════════════════════════════════════════════════════════════════
//  COMPARISON MATRIX — using drawn shapes instead of Unicode
// ═══════════════════════════════════════════════════════════════════════════════

doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(22).font('Helvetica-Bold')
   .text('Comparative Permissions Matrix', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Side-by-side comparison of feature access across all 8 platform roles.', M, doc.y, { width: CW });
doc.moveDown(0.6);
doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.6);

const matrix = [
    { feature: 'Create Colleges',           perm: [1,0,0,0,0,0,0,0] },
    { feature: 'Edit College Profile',      perm: [1,1,1,1,1,1,0,0] },
    { feature: 'Delete Colleges',           perm: [1,1,0,0,0,0,0,0] },
    { feature: 'Create Admin Users',        perm: [1,1,0,0,0,0,0,0] },
    { feature: 'Manage Trainers',           perm: [1,1,1,1,1,1,0,0] },
    { feature: 'Create Courses',            perm: [1,1,1,1,1,1,0,0] },
    { feature: 'Delete Courses',            perm: [1,1,0,0,0,0,0,0] },
    { feature: 'Manage Batches',            perm: [1,1,1,1,1,1,0,0] },
    { feature: 'Create Exams',              perm: [1,1,1,1,1,1,1,0] },
    { feature: 'Delete Exams',              perm: [1,1,0,0,0,0,0,0] },
    { feature: 'Clone Exams',               perm: [1,1,1,1,1,1,1,0] },
    { feature: 'Manage Question Banks',     perm: [1,1,1,1,1,1,1,0] },
    { feature: 'Allot Exams (Access Keys)', perm: [1,1,1,1,1,1,0,0] },
    { feature: 'Live Exam Proctoring',      perm: [1,1,1,1,1,1,1,0] },
    { feature: 'Mark Attendance',           perm: [0,0,0,0,0,0,1,0] },
    { feature: 'View Attendance Reports',   perm: [1,1,1,1,1,1,1,1] },
    { feature: 'Submit Training Logs',      perm: [0,0,0,0,0,0,1,0] },
    { feature: 'View Training Logs',        perm: [1,1,1,1,1,1,1,0] },
    { feature: 'Export Reports (Excel)',     perm: [1,1,1,1,1,1,1,0] },
    { feature: 'View Analytics Dashboard',  perm: [1,1,1,1,1,1,1,0] },
    { feature: 'View Audit Trail',          perm: [1,1,1,1,1,1,0,0] },
    { feature: 'System Notifications',      perm: [1,0,0,0,0,1,0,0] },
    { feature: 'Take Exams',               perm: [0,0,0,0,0,0,0,1] },
    { feature: 'Personal To-Do List',       perm: [0,0,0,0,0,0,0,1] },
];

const colHeaders = ['SA','OA','AOA','RM','ARM','CA','TR','ST'];
const featureColW = 152;
const permColW = (CW - featureColW) / 8;
const rowH = 20;

// Table header
let ty = doc.y;
doc.rect(M, ty, CW, 24).fill(C.navy);
doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
   .text('Feature / Permission', M + 8, ty + 7);

colHeaders.forEach((h, i) => {
    const hx = M + featureColW + i * permColW;
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold')
       .text(h, hx, ty + 7, { width: permColW, align: 'center' });
});
ty += 24;

// Data rows
matrix.forEach((row, idx) => {
    if (ty + rowH > PH - 55) {
        // Continue on next page
        doc.addPage();
        doc.y = 55;
        ty = 55;

        // Redraw header on new page
        doc.rect(M, ty, CW, 24).fill(C.navy);
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
           .text('Feature / Permission', M + 8, ty + 7);
        colHeaders.forEach((h, i) => {
            const hx = M + featureColW + i * permColW;
            doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold')
               .text(h, hx, ty + 7, { width: permColW, align: 'center' });
        });
        ty += 24;
    }

    const rowBg = idx % 2 === 0 ? C.white : C.slate50;
    doc.rect(M, ty, CW, rowH).fill(rowBg);
    doc.rect(M, ty, CW, rowH).lineWidth(0.3).stroke(C.slate200);

    // Feature name
    doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica')
       .text(row.feature, M + 8, ty + 5, { width: featureColW - 12 });

    // Permission dots
    row.perm.forEach((p, i) => {
        const cx = M + featureColW + i * permColW + permColW / 2;
        const cyDot = ty + rowH / 2;

        if (p === 1) {
            // Green filled circle = granted
            drawDot(cx, cyDot, 4.5, C.green600);
            // White checkmark line drawn manually
            doc.save();
            doc.lineWidth(1.2).strokeColor(C.white);
            doc.moveTo(cx - 2.2, cyDot + 0.2)
               .lineTo(cx - 0.5, cyDot + 2)
               .lineTo(cx + 2.5, cyDot - 1.5)
               .stroke();
            doc.restore();
        } else {
            // Light gray circle with dash = denied
            drawDot(cx, cyDot, 4.5, C.slate200);
            doc.save();
            doc.lineWidth(1.2).strokeColor(C.slate400);
            doc.moveTo(cx - 2, cyDot).lineTo(cx + 2, cyDot).stroke();
            doc.restore();
        }
    });

    ty += rowH;
});

// Legend
ty += 10;
doc.rect(M, ty, CW, 30).fill(C.slate50);
doc.rect(M, ty, CW, 30).lineWidth(0.3).stroke(C.slate200);

doc.fillColor(C.slate500).fontSize(7).font('Helvetica-Bold').text('LEGEND:', M + 10, ty + 5);

// Green dot legend
drawDot(M + 60, ty + 9, 4, C.green600);
doc.fillColor(C.slate600).fontSize(7).font('Helvetica').text('Access Granted', M + 70, ty + 5);

// Gray dot legend
drawDot(M + 155, ty + 9, 4, C.slate200);
doc.fillColor(C.slate600).fontSize(7).font('Helvetica').text('Access Denied', M + 165, ty + 5);

doc.fillColor(C.slate400).fontSize(6.5).font('Helvetica')
   .text('SA = Super Admin  |  OA = Ops Admin  |  AOA = Asst Ops Admin  |  RM = Regional Manager  |  ARM = Asst RM  |  CA = College Admin  |  TR = Trainer  |  ST = Student', M + 10, ty + 18, { width: CW - 20 });


// ═══════════════════════════════════════════════════════════════════════════════
//  SCOPE HIERARCHY DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(22).font('Helvetica-Bold')
   .text('Scope Hierarchy & Access Boundaries', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Visual representation of how role scopes nest within the platform architecture.', M, doc.y, {width: CW});
doc.moveDown(0.8);
doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(1.2);

const cx = PW / 2;
const baseHierY = doc.y;

const hierLayers = [
    { label: 'GLOBAL SCOPE',        sub: 'Super Admin  /  Ops Admin  /  Asst Ops Admin',   w: 420, h: 330, bg: '#FEE2E2', border: '#FECACA', tc: '#991B1B' },
    { label: 'REGIONAL SCOPE',      sub: 'Regional Manager  /  Asst Regional Manager',     w: 340, h: 256, bg: C.green100, border: '#A7F3D0', tc: C.green800 },
    { label: 'INSTITUTIONAL SCOPE', sub: 'College Admin',                                   w: 260, h: 182, bg: '#DBEAFE', border: '#BFDBFE', tc: C.blue800 },
    { label: 'CLASSROOM SCOPE',     sub: 'Trainer',                                         w: 180, h: 108, bg: C.amber100, border: '#FDE68A', tc: C.amber800 },
    { label: 'PORTAL',              sub: 'Student',                                         w: 110, h:  46, bg: C.slate100, border: C.slate300, tc: C.slate800 },
];

hierLayers.forEach(l => {
    const lx = cx - l.w / 2;
    const ly = baseHierY + (330 - l.h) / 2;
    doc.roundedRect(lx, ly, l.w, l.h, 6).lineWidth(1).fillAndStroke(l.bg, l.border);
    doc.fillColor(l.tc).fontSize(9).font('Helvetica-Bold')
       .text(l.label, lx, ly + 8, { width: l.w, align: 'center' });
    doc.fillColor(l.tc).opacity(0.6).fontSize(6.5).font('Helvetica')
       .text(l.sub, lx, ly + 20, { width: l.w, align: 'center' });
    doc.opacity(1);
});

doc.y = baseHierY + 350;
doc.fillColor(C.slate500).fontSize(7.5).font('Helvetica')
   .text('Each inner scope inherits data visibility restrictions from its parent boundary. Roles cannot access data or perform actions outside their defined scope.', M, doc.y, { width: CW, align: 'center', lineGap: 2 });


// ═══════════════════════════════════════════════════════════════════════════════
//  LAST PAGE — CLOSING
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();

// Navy fill
doc.rect(0, 0, PW, PH).fill(C.navy);
doc.rect(0, 0, PW, 3).fill(C.white);
doc.rect(0, PH - 3, PW, 3).fill(C.white);

// Vertical green accent
doc.rect(M - 8, 260, 4, 100).fill(C.green600);

doc.fillColor(C.white).opacity(0.45)
   .fontSize(9).font('Helvetica-Bold')
   .text('ETHNOTECH ACADEMY', M, 230, { width: CW, align: 'center' });
doc.opacity(1);

// Green line
doc.rect(PW/2 - 30, 248, 60, 2).fill(C.green600);

doc.fillColor(C.white)
   .fontSize(32).font('Helvetica-Bold')
   .text('Thank You', M, 270, { width: CW, align: 'center' });

doc.fillColor(C.white).opacity(0.65)
   .fontSize(10).font('Helvetica')
   .text('For questions, feedback, or access requests,', M, 320, { width: CW, align: 'center' })
   .text('please contact the Ethnotech Academy Platform Team.', M, 335, { width: CW, align: 'center' });
doc.opacity(1);

// Contact box
doc.roundedRect(M + 80, 380, CW - 160, 70, 6).lineWidth(0.6).stroke('#FFFFFF20');
doc.fillColor(C.white).opacity(0.45)
   .fontSize(7).font('Helvetica-Bold')
   .text('CONTACT & SUPPORT', M + 80, 392, { width: CW - 160, align: 'center' });
doc.opacity(1);
doc.moveTo(PW/2 - 50, 404).lineTo(PW/2 + 50, 404).lineWidth(0.3).stroke('#FFFFFF15');
doc.fillColor(C.white).opacity(0.7)
   .fontSize(8).font('Helvetica')
   .text('admin@ethnotech.in  |  www.ethnotechacademy.com', M + 80, 412, { width: CW - 160, align: 'center' });
doc.opacity(1);
doc.fillColor(C.white).opacity(0.5)
   .fontSize(7).font('Helvetica')
   .text('Platform v3.0  |  Document Rev. June 2026', M + 80, 430, { width: CW - 160, align: 'center' });
doc.opacity(1);

// Confidentiality
doc.roundedRect(M + 50, 500, CW - 100, 65, 4).fill('#FFFFFF08');
doc.fillColor(C.white).opacity(0.4)
   .fontSize(6.5).font('Helvetica-Bold')
   .text('CONFIDENTIALITY NOTICE', M + 50, 510, { width: CW - 100, align: 'center' });
doc.opacity(1);
doc.fillColor(C.white).opacity(0.3)
   .fontSize(6).font('Helvetica')
   .text('This document contains proprietary information belonging to Ethnotech Academy. It is intended solely for internal administrative use. Unauthorized distribution, reproduction, or disclosure is strictly prohibited.', M + 60, 524, { width: CW - 120, align: 'center', lineGap: 2 });
doc.opacity(1);

doc.fillColor(C.white).opacity(0.25)
   .fontSize(7).font('Helvetica')
   .text('(c) 2026 Ethnotech Academy. All rights reserved.', M, PH - 45, { width: CW, align: 'center' });
doc.opacity(1);


// ═══════════════════════════════════════════════════════════════════════════════
//  POST-PROCESS: Add headers/footers to every content page using bufferPages
// ═══════════════════════════════════════════════════════════════════════════════

const range = doc.bufferedPageRange();
const totalPages = range.count;

for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Skip cover (page 0) and last page (closing)
    if (i === 0 || i === totalPages - 1) continue;

    // ─── HEADER ───
    doc.rect(0, 0, PW, 6).fill(C.navy);
    doc.rect(0, 6, PW, 1.5).fill(C.darkNavy);

    doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
       .text('ETHNOTECH ACADEMY', M, 16, { continued: false });
    doc.fillColor(C.slate400).fontSize(7).font('Helvetica')
       .text('Assessment Management Platform', M, 28);

    doc.fillColor(C.slate400).fontSize(7).font('Helvetica')
       .text('Role Privileges Guide  |  Confidential  |  June 2026', PW - M - 220, 20, { width: 220, align: 'right' });

    doc.moveTo(M, 42).lineTo(PW - M, 42).lineWidth(0.4).stroke(C.slate200);

    // ─── FOOTER ───
    const footY = PH - 30;
    doc.moveTo(M, footY).lineTo(PW - M, footY).lineWidth(0.4).stroke(C.slate200);
    doc.fillColor(C.slate400).fontSize(6.5).font('Helvetica')
       .text('(c) 2026 Ethnotech Academy. All rights reserved. Internal use only.', M, footY + 6, { width: CW * 0.7 });
    doc.fillColor(C.slate500).fontSize(7).font('Helvetica-Bold')
       .text(`Page ${i + 1} of ${totalPages}`, PW - M - 60, footY + 6, { width: 60, align: 'right' });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  FINALIZE
// ═══════════════════════════════════════════════════════════════════════════════
doc.end();
console.log('PDF generated at:', outputPath);
