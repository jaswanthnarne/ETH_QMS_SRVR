const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// Instacks vs. Ethops (Eth_Quiz) — Comparative Analysis PDF Generator
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
    blue50:     '#EFF6FF',
    blue100:    '#DBEAFE',
    blue600:    '#2563EB',
    blue800:    '#1E40AF',
};

const PW = 595.28;
const PH = 841.89;
const M  = 50;       // margin
const CW = PW - M*2; // content width

// Create document
const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: {
        Title: 'Instacks vs. Ethops (Eth_Quiz) Comparative Analysis',
        Author: 'Ethnotech Academy',
        Subject: 'Platform Evaluation & Recommendations',
    }
});

const outputPath = path.join('d:', 'Eth_Quiz_New', 'Instacks_vs_Ethops_Comparison.pdf');
doc.pipe(fs.createWriteStream(outputPath));

// Utility: check if y + height overflows page
function needsBreak(spaceNeeded) {
    return doc.y + spaceNeeded > PH - 55;
}

// Utility: draw a filled circle
function drawDot(x, y, r, color) {
    doc.circle(x, y, r).fill(color);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — COVER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

// Navy background
doc.rect(0, 0, PW, PH).fill(C.navy);

// Top thin white accent line
doc.rect(0, 0, PW, 3).fill(C.white);

// Left vertical green accent stripe
doc.rect(M - 8, M + 40, 4, 260).fill(C.green600);

// Top small logo text
doc.fillColor(C.white).opacity(0.5)
   .fontSize(9).font('Helvetica-Bold')
   .text('ETHNOTECH ACADEMY & ETHOPS', M, M + 20);
doc.opacity(1);

doc.fillColor(C.white).opacity(0.35)
   .fontSize(8).font('Helvetica')
   .text('Platform Evaluation & Strategic Analysis', M, M + 34);
doc.opacity(1);

// Main Titles
doc.fillColor(C.white)
   .fontSize(34).font('Helvetica-Bold')
   .text('Instacks vs. Ethops', M, 180);

doc.fillColor(C.white)
   .fontSize(24).font('Helvetica-Bold')
   .text('Comparative Evaluation Report', M, 225);

// Green accent line below title
doc.rect(M, 265, 80, 3).fill(C.green600);

// Subtitle description
doc.fillColor(C.white).opacity(0.7)
   .fontSize(10.5).font('Helvetica')
   .text('A comprehensive review of system architectures, user personas, core functionalities,', M, 290)
   .text('proctoring mechanisms, and recommendations for bridging platform gaps.', M, 305);
doc.opacity(1);

// Platform tags
const platforms = [
    { label: 'Instacks', desc: 'LMS / Upskilling / Recruitment SaaS' },
    { label: 'Ethops (Eth_Quiz)', desc: 'Institutional High-Performance Assessment System' }
];

const tagY = 360;
platforms.forEach((p, idx) => {
    const cx = M + idx * 240;
    doc.roundedRect(cx, tagY, 210, 45, 5).fill('#FFFFFF15');
    doc.fillColor(C.white)
       .fontSize(11).font('Helvetica-Bold')
       .text(p.label, cx, tagY + 8, { width: 210, align: 'center' });
    doc.fillColor(C.white).opacity(0.5)
       .fontSize(7).font('Helvetica')
       .text(p.desc, cx, tagY + 26, { width: 210, align: 'center' });
    doc.opacity(1);
});

// Document details metadata box
const metaY = 520;
doc.roundedRect(M, metaY, CW, 130, 6).lineWidth(0.8).stroke('#FFFFFF20');

doc.fillColor(C.white).opacity(0.55)
   .fontSize(7.5).font('Helvetica-Bold')
   .text('DOCUMENT SPECIFICATIONS', M + 16, metaY + 14);
doc.opacity(1);

doc.moveTo(M + 16, metaY + 28).lineTo(M + CW - 16, metaY + 28).lineWidth(0.4).stroke('#FFFFFF15');

const metaRows = [
    ['Document Type', 'Comparative Evaluation & Recommendations'],
    ['Version', '1.0 — June 2026'],
    ['Classification', 'Confidential — Technical Management'],
    ['Scope Covered', 'Student Assessment, Live Proctoring, LMS, IDE Compiler, LSRW'],
    ['Target Platforms', 'Instacks Portal vs. Ethops (Eth_Quiz) Multi-Console'],
    ['Authoring Unit', 'Product Development & Architecture Team'],
];

metaRows.forEach((r, idx) => {
    const ry = metaY + 36 + idx * 14;
    doc.fillColor(C.white).opacity(0.5).fontSize(7.5).font('Helvetica-Bold').text(r[0], M + 20, ry);
    doc.opacity(1);
    doc.fillColor(C.white).opacity(0.75).fontSize(7.5).font('Helvetica').text(r[1], M + 180, ry);
    doc.opacity(1);
});

// Footer rights
doc.fillColor(C.white).opacity(0.3)
   .fontSize(7).font('Helvetica')
   .text('(c) 2026 Ethops & Ethnotech Academy. Confidential. All rights reserved.', M, PH - 45, { width: CW, align: 'center' });
doc.opacity(1);

doc.rect(0, PH - 3, PW, 3).fill(C.white);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — TABLE OF CONTENTS & EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(20).font('Helvetica-Bold').text('Table of Contents', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Index of sections detailing the comparative findings.', M, doc.y, { width: CW });
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

const toc = [
    { n: '01', t: 'Cover Page', d: 'Document identity, classification, and metadata details.', p: '1' },
    { n: '02', t: 'Table of Contents & Executive Summary', d: 'Section index and overview of core focus areas.', p: '2' },
    { n: '03', t: 'Structural Architecture & User Personas', d: 'How users and resources are organized in both systems.', p: '3' },
    { n: '04', t: 'Comparative Permissions & Feature Matrix', d: 'Side-by-side comparison of functional modules.', p: '4' },
    { n: '05', t: 'Strengths & Functional Gaps', d: 'Platform advantages, what Instacks does best, and Ethops strengths.', p: '5' },
    { n: '06', t: 'Strategic Recommendations & Action Plan', d: 'Step-by-step guidance to upgrade Ethops capabilities.', p: '6' }
];

toc.forEach(e => {
    const ey = doc.y;
    doc.roundedRect(M, ey, 24, 24, 3).fill(C.slate100);
    doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
       .text(e.n, M, ey + 7, { width: 24, align: 'center' });

    doc.fillColor(C.slate800).fontSize(9.5).font('Helvetica-Bold').text(e.t, M + 34, ey + 3);
    doc.fillColor(C.slate500).fontSize(7.5).font('Helvetica').text(e.d, M + 34, ey + 15);

    doc.fillColor(C.slate400).fontSize(8.5).font('Helvetica-Bold')
       .text(e.p, PW - M - 30, ey + 7, { width: 30, align: 'right' });

    doc.moveTo(M + 34 + doc.widthOfString(e.t, {font: 'Helvetica-Bold', size:9.5}) + 8, ey + 9)
       .lineTo(PW - M - 35, ey + 9)
       .lineWidth(0.3)
       .dash(2, { space: 2 })
       .stroke(C.slate300);
    doc.undash();

    doc.y = ey + 32;
});

doc.moveDown(1.5);
let esY = doc.y;

// Divider
doc.moveTo(M, esY).lineTo(M + CW, esY).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);
esY = doc.y;

doc.rect(M, esY, CW, 140).fill(C.slate50);
doc.rect(M, esY, 4, 140).fill(C.navy);

doc.fillColor(C.navy).fontSize(12).font('Helvetica-Bold')
   .text('Executive Summary', M + 14, esY + 10);

doc.fillColor(C.slate700).fontSize(8).font('Helvetica')
   .text(
       'This evaluation provides a granular breakdown comparing Instacks (an AI-powered Learning Management and pre-screening assessment tool) with Ethops (Eth_Quiz - an institutional client-server quiz console designed for trainers, college admins, and students). \n\n' +
       'While Instacks offers comprehensive out-of-the-box support for modular courses (LMS), coding playgrounds (IDE compilers), and language proficiency checkouts (LSRW: Listening, Speaking, Reading, Writing), Ethops stands out in its specialized, low-latency live proctoring control. Through Socket.io networks, Ethops grants invigilators active command to pause, resume, or terminate student attempts, view audits, and interact via live chat. \n\n' +
       'This document maps specific paths to bring Ethops to feature parity, focusing on compiler APIs, structured note-sharing, dynamic question generation, and webcam AI logs.',
       M + 14, esY + 28, { width: CW - 28, lineGap: 3.5 }
   );

doc.y = esY + 150;

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — STRUCTURAL ARCHITECTURE & USER PERSONAS
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(20).font('Helvetica-Bold').text('System Architecture & Core Personas', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Understanding the tenant structures and access layers of both platforms.', M, doc.y, { width: CW });
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

// Subheading: Instacks
doc.fillColor(C.navy).fontSize(12).font('Helvetica-Bold').text('Instacks: SaaS Tenant & Recruitment Model', M);
doc.moveDown(0.4);

let ay = doc.y;
doc.rect(M, ay, CW, 80).fill(C.white);
doc.rect(M, ay, CW, 80).lineWidth(0.4).stroke(C.slate200);

doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica-Bold').text('PORTALS & TENANTS:', M + 12, ay + 10);
doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text(
       '• Student Portal ([college].instacks.co / demoaccount.instacks.co): A modular interface containing placements assessments, courses, LSRW communication assessments, and interactive compiler panels.\n' +
       '• Vendor/Recruiter Portal (instacks.co/vendor): A corporate portal enabling recruiters to build custom screening drives, administer company-pattern tests, and read placement analytics.\n' +
       '• Faculty/Admin Portal: Dedicated tools to track college performance, assign batches, and construct custom learning materials.',
       M + 12, ay + 24, { width: CW - 24, lineGap: 3 }
   );

doc.y = ay + 90;
doc.moveDown(0.5);

// Subheading: Ethops
doc.fillColor(C.navy).fontSize(12).font('Helvetica-Bold').text('Ethops (Eth_Quiz): Role-Based Console Model', doc.x);
doc.moveDown(0.4);

ay = doc.y;
doc.rect(M, ay, CW, 92).fill(C.white);
doc.rect(M, ay, CW, 92).lineWidth(0.4).stroke(C.slate200);

doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica-Bold').text('CONSOLES & ROLES:', M + 12, ay + 10);
doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text(
       '• Student Console (client-student / StudentEntry.jsx): A minimalist portal where students enter an Exam Key, launch an assessment screen, and trigger real-time telemetry (tab alerts, progress timer).\n' +
       '• Trainer Console (client-trainer / LiveSession.jsx): An invigilator desk driven by Socket.io, providing live controls (start, pause, resume, terminate exams) and student-trainer chats.\n' +
       '• Administrative Console (client / Admin Panel): Comprehensive management to CRUD Colleges, global Courses, Trainer mappings, Exam configs, Audit Logs, and visual analytics.',
       M + 12, ay + 24, { width: CW - 24, lineGap: 3 }
   );

doc.y = ay + 102;
doc.moveDown(0.8);

// Diagram / Concept Box
let dbY = doc.y;
doc.rect(M, dbY, CW, 90).fill(C.blue50);
doc.rect(M, dbY, CW, 90).lineWidth(0.5).stroke(C.blue100);

doc.fillColor(C.blue800).fontSize(9).font('Helvetica-Bold')
   .text('Comparison of User Flow & Session Scoping', M + 14, dbY + 10);

doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica-Bold').text('Instacks (Long-Term Learning)', M + 14, dbY + 28);
doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text('Student logs in via portal credentials -> Enrolls in course -> Completes placement/LSRW/IDE practice -> Auto-generated reports -> Vendor retrieves candidate profiles.', M + 14, dbY + 39, { width: CW - 28 });

doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica-Bold').text('Ethops (Real-Time Secure Testing)', M + 14, dbY + 58);
doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text('Trainer generates batch session -> Student inputs Exam Key -> Live sockets register connection -> Trainer proctors & chats -> Exam completes -> Immediate grade check & audit trail.', M + 14, dbY + 69, { width: CW - 28 });

doc.y = dbY + 100;

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — COMPREHENSIVE FEATURE MATRIX
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(20).font('Helvetica-Bold').text('Functional Feature Matrix', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Side-by-side comparison of specific platform modules and technical capabilities.', M, doc.y, { width: CW });
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

const matrix = [
    { feature: 'Core MCQs (Text & Image Questions)', instacks: true, ethops: true, detail: 'Both support complex quiz banks with media attachments.' },
    { feature: 'Multi-Language IDE & Compilers', instacks: true, ethops: false, detail: 'Instacks runs live code compilers; Ethops lacks compile execution.' },
    { feature: 'Language Proficiency Testing (LSRW)', instacks: true, ethops: false, detail: 'Instacks checks Listening, Speaking, Reading, Writing.' },
    { feature: 'No-Code Course LMS Builder', instacks: true, ethops: false, detail: 'Instacks hosts learning modules; Ethops is assessment-focused.' },
    { feature: 'Live Proctoring control room', instacks: false, ethops: true, detail: 'Ethops invigilators have live socket pause/resume/end commands.' },
    { feature: 'Trainer-Student Sockets & Chats', instacks: false, ethops: true, detail: 'Ethops supports live communication during the test session.' },
    { feature: 'Anti-Cheat Warnings (Tab Switch)', instacks: true, ethops: true, detail: 'Both trigger alerts when students lose browser focus.' },
    { feature: 'VPN Detection & Location Scoping', instacks: true, ethops: false, detail: 'Instacks validates access IPs; Ethops depends on local keys.' },
    { feature: 'Security Audit Logs & Logs Export', instacks: false, ethops: true, detail: 'Ethops monitors and stores admin logs in a global model.' },
    { feature: 'Recruiter Gateways & Placements', instacks: true, ethops: true, detail: 'Instacks has corporate screening portals; Ethops features college Placement Officer dashboard, job posts, eligibility parameters, and rosters.' },
    { feature: 'Automated Certificate Generation', instacks: true, ethops: false, detail: 'Instacks generates passing PDFs; Ethops planned in roadmap.' },
    { feature: 'Visual Leaderboards & Analytics', instacks: true, ethops: true, detail: 'Both systems compile visual performance stats & scores.' }
];

const featureColW = 190;
const brandColW = 75;
const detailColW = CW - featureColW - (brandColW * 2);
const rowH = 24;

// Table header
let ty = doc.y;
doc.rect(M, ty, CW, 24).fill(C.navy);
doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold').text('Module / Capability', M + 8, ty + 7);
doc.text('Instacks', M + featureColW, ty + 7, { width: brandColW, align: 'center' });
doc.text('Ethops (Eth_Quiz)', M + featureColW + brandColW, ty + 7, { width: brandColW, align: 'center' });
doc.text('Notes / Detailed Difference', M + featureColW + brandColW * 2, ty + 7, { width: detailColW });
ty += 24;

matrix.forEach((row, idx) => {
    if (ty + rowH > PH - 55) {
        doc.addPage();
        doc.y = 55;
        ty = 55;

        // Redraw Header
        doc.rect(M, ty, CW, 24).fill(C.navy);
        doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold').text('Module / Capability', M + 8, ty + 7);
        doc.text('Instacks', M + featureColW, ty + 7, { width: brandColW, align: 'center' });
        doc.text('Ethops (Eth_Quiz)', M + featureColW + brandColW, ty + 7, { width: brandColW, align: 'center' });
        doc.text('Notes / Detailed Difference', M + featureColW + brandColW * 2, ty + 7, { width: detailColW });
        ty += 24;
    }

    const rowBg = idx % 2 === 0 ? C.white : C.slate50;
    doc.rect(M, ty, CW, rowH).fill(rowBg);
    doc.rect(M, ty, CW, rowH).lineWidth(0.3).stroke(C.slate200);

    // Feature title
    doc.fillColor(C.slate800).fontSize(7.5).font('Helvetica-Bold').text(row.feature, M + 8, ty + 7, { width: featureColW - 12 });

    // Instacks Check
    const ix = M + featureColW + brandColW / 2;
    const iy = ty + rowH / 2;
    if (row.instacks) {
        drawDot(ix, iy, 4.5, C.green600);
        doc.save().lineWidth(1.2).strokeColor(C.white).moveTo(ix - 2.2, iy + 0.2).lineTo(ix - 0.5, iy + 2).lineTo(ix + 2.5, iy - 1.5).stroke().restore();
    } else {
        drawDot(ix, iy, 4.5, C.slate200);
        doc.save().lineWidth(1.2).strokeColor(C.slate400).moveTo(ix - 2, iy).lineTo(ix + 2, iy).stroke().restore();
    }

    // Ethops Check
    const ex = M + featureColW + brandColW + brandColW / 2;
    if (row.ethops) {
        drawDot(ex, iy, 4.5, C.green600);
        doc.save().lineWidth(1.2).strokeColor(C.white).moveTo(ex - 2.2, iy + 0.2).lineTo(ex - 0.5, iy + 2).lineTo(ex + 2.5, iy - 1.5).stroke().restore();
    } else {
        drawDot(ex, iy, 4.5, C.slate200);
        doc.save().lineWidth(1.2).strokeColor(C.slate400).moveTo(ex - 2, iy).lineTo(ex + 2, iy).stroke().restore();
    }

    // Detail notes
    doc.fillColor(C.slate600).fontSize(7).font('Helvetica').text(row.detail, M + featureColW + brandColW * 2, ty + 6, { width: detailColW - 5, lineGap: 1 });

    ty += rowH;
});

doc.y = ty + 15;

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 5 — STRENGTHS & FUNCTIONAL GAPS
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(20).font('Helvetica-Bold').text('Platform Strengths & Functional Gaps', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Analyzing the distinct advantages and feature limitations of both setups.', M, doc.y, { width: CW });
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

// Column layout for Strengths
const colW = (CW - 15) / 2;

// Left column: Instacks Strengths
let sy = doc.y;
doc.rect(M, sy, colW, 20).fill(C.navy);
doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('What Instacks Does Best', M + 8, sy + 6);

doc.rect(M, sy + 20, colW, 215).fill(C.slate50);
doc.rect(M, sy + 20, colW, 215).lineWidth(0.4).stroke(C.slate200);

doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text(
       '1. Unified Learning & Assessment\n' +
       'Seamless course delivery combined with checks. Students watch content and take exams under one platform, reinforcing learning paths.\n\n' +
       '2. Multi-Language Code Compilers\n' +
       'Enables computer science testing. Students run, compile, and debug code snippets within the assessment canvas.\n\n' +
       '3. Communication Evaluation (LSRW)\n' +
       'Built-in audio playback, mic checks, and AI modules evaluate pronunciation, grammar, and reading comprehension.\n\n' +
       '4. Direct Recruiter (Vendor) Conduit\n' +
       'Allows companies to conduct remote placement drives, screen top performers, and review candidate portfolios directly.',
       M + 8, sy + 28, { width: colW - 16, lineGap: 3.5 }
   );

// Right column: Ethops Strengths
doc.rect(M + colW + 15, sy, colW, 20).fill(C.green600);
doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('What Ethops (Eth_Quiz) Does Best', M + colW + 23, sy + 6);

doc.rect(M + colW + 15, sy + 20, colW, 215).fill(C.slate50);
doc.rect(M + colW + 15, sy + 20, colW, 215).lineWidth(0.4).stroke(C.slate200);

doc.fillColor(C.slate700).fontSize(7.5).font('Helvetica')
   .text(
       '1. Sockets & Live Proctoring Desk\n' +
       'Real-time control via Socket.io. Invigilators can pause or terminate attempts instantly, verify connections, and broadcast instructions.\n\n' +
       '2. Interactive Proctor-Student Chats\n' +
       'Allows student-to-trainer communication directly inside the locked exam UI for swift troubleshooting.\n\n' +
       '3. Simple Exam-Key Entry Gateway\n' +
       'Frictionless entry where students submit a session-specific key rather than typing long credentials, reducing lab prep delays.\n\n' +
       '4. System Audit Trail\n' +
       'Detailed logging of all admin modifications (updates, user creations, course additions), establishing strong security compliance.',
       M + colW + 23, sy + 28, { width: colW - 16, lineGap: 3.5 }
   );

doc.y = sy + 245;
doc.moveDown(1);

// Gap summary
let gapY = doc.y;
doc.rect(M, gapY, CW, 85).fill(C.amber50);
doc.rect(M, gapY, 4, 85).fill(C.amber600);

doc.fillColor(C.amber800).fontSize(9.5).font('Helvetica-Bold').text('Key Functional Gap & Strategic Choice', M + 14, gapY + 10);
doc.fillColor(C.amber800).fontSize(8).font('Helvetica')
   .text(
       'Ethops operates as a superior, low-latency testing console for secure campus environments. However, to match the placement-preparation appeal of Instacks, Ethops must address its gaps in code compilation and media/document sharing.\n\n' +
       'Rather than rebuilding a complete LMS (which requires major resources), Ethops can achieve a high-value compromise by integrating micro-LMS file sharing (attaching notes/PDFs to batch courses) and adding compiler widgets for technical assessments.',
       M + 14, gapY + 24, { width: CW - 28, lineGap: 3 }
   );

doc.y = gapY + 95;

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 6 — RECOMMENDATIONS & TECHNICAL ACTION PLAN
// ═══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.y = 55;

doc.fillColor(C.slate800).fontSize(20).font('Helvetica-Bold').text('Strategic Action Plan', M);
doc.moveDown(0.2);
doc.fillColor(C.slate500).fontSize(8.5).font('Helvetica')
   .text('Implementation roadmap to expand Ethops assessment capabilities.', M, doc.y, { width: CW });
doc.moveDown(0.8);

doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).stroke(C.slate200);
doc.moveDown(0.8);

const recs = [
    {
        title: 'A. Integrated Coding IDE (Compiler API)',
        action: 'Incorporate an external compile service like Judge0 API or a sandboxed execution microservice.',
        benefit: 'Allows trainers to create coding assessments (C, C++, Java, Python, JS). Compiles, tests, and auto-grades student code scripts inside the exam workspace, matching Instacks core technical exam focus.',
        timeline: 'Weeks 1 - 3 (Backend integrations & frontend editor updates)'
    },
    {
        title: 'B. Decoupled Centralized Question Bank',
        action: 'Refactor database models to separate questions from specific exams into a master repository.',
        benefit: 'Enables dynamic question pulling using tag filters (Subject, Course Topic, Difficulty Level, Bloom Taxonomy). Allows creation of randomized, unique test papers matching defined rules.',
        timeline: 'Weeks 4 - 5 (Database migrations & quiz builder refactoring)'
    },
    {
        title: 'C. Micro-LMS Study Material Hosting',
        action: 'Add a PDF/Document attachment uploader (using existing Cloudinary/Multer configurations) to Course/Batch modules.',
        benefit: 'Allows trainers to distribute notes or syllabus PDFs directly to student dashboards. Bridges the functional LMS gap without the overhead of constructing a full course editor.',
        timeline: 'Week 6 (Admin uploads & student dashboard downloads)'
    },
    {
        title: 'D. Advanced Remote-Proctoring Analytics',
        action: 'Integrate browser webcam capture cycles and ambient volume level trackers.',
        benefit: 'Saves periodic snapshots and audio warnings to the database. Renders cheating telemetry directly in the Trainer Waitroom and the Audit Logs, establishing strict remote accountability.',
        timeline: 'Weeks 7 - 8 (WebRTC camera integration & admin review tools)'
    }
];

recs.forEach(r => {
    const ry = doc.y;
    doc.rect(M, ry, CW, 70).fill(C.white);
    doc.rect(M, ry, CW, 70).lineWidth(0.4).stroke(C.slate200);

    // Left accent bar
    doc.rect(M, ry, 3, 70).fill(C.navy);

    doc.fillColor(C.navy).fontSize(8.5).font('Helvetica-Bold').text(r.title, M + 12, ry + 8);
    
    doc.fillColor(C.slate800).fontSize(7).font('Helvetica-Bold').text('ACTION: ', M + 12, ry + 22);
    const actW = doc.widthOfString('ACTION: ', { font: 'Helvetica-Bold', size: 7 });
    doc.fillColor(C.slate700).fontSize(7).font('Helvetica').text(r.action, M + 12 + actW, ry + 22, { width: CW - 24 - actW });

    doc.fillColor(C.slate800).fontSize(7).font('Helvetica-Bold').text('BENEFIT: ', M + 12, ry + 34);
    const benW = doc.widthOfString('BENEFIT: ', { font: 'Helvetica-Bold', size: 7 });
    doc.fillColor(C.slate700).fontSize(7).font('Helvetica').text(r.benefit, M + 12 + benW, ry + 34, { width: CW - 24 - benW, lineGap: 1.5 });

    doc.fillColor(C.slate500).fontSize(6.5).font('Helvetica-Bold').text('Est. Timeline: ' + r.timeline, M + 12, ry + 58);

    doc.y = ry + 78;
});

// Final note
doc.moveDown(0.2);
let fnY = doc.y;
doc.rect(M, fnY, CW, 45).fill(C.blue50);
doc.rect(M, fnY, CW, 45).lineWidth(0.4).stroke(C.blue100);
doc.fillColor(C.blue800).fontSize(7.5).font('Helvetica-Bold').text('Conclusion & Value Proposition', M + 12, fnY + 8);
doc.fillColor(C.slate700).fontSize(7).font('Helvetica')
   .text('By pursuing this modular implementation path, Ethops can establish itself as a highly competitive option. It combines the rigorous integrity of a secure campus assessment dashboard with the upskilling versatility of modern LMS-linked systems.', M + 12, fnY + 18, { width: CW - 24, lineGap: 1.5 });


// ═══════════════════════════════════════════════════════════════════════════════
// POST-PROCESS: Headers & Footers
// ═══════════════════════════════════════════════════════════════════════════════

const range = doc.bufferedPageRange();
const totalPages = range.count;

for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Skip cover page (0)
    if (i === 0) continue;

    // Header
    doc.rect(0, 0, PW, 6).fill(C.navy);
    doc.rect(0, 6, PW, 1.5).fill(C.darkNavy);

    doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
       .text('INSTACKS VS. ETHOPS (ETH_QUIZ)', M, 16);
    
    doc.fillColor(C.slate400).fontSize(7).font('Helvetica')
       .text('Platform Feature & Architecture Comparison', M, 28);

    doc.fillColor(C.slate400).fontSize(7).font('Helvetica')
       .text('Confidential Evaluation Report  |  June 2026', PW - M - 200, 20, { width: 200, align: 'right' });

    doc.moveTo(M, 42).lineTo(PW - M, 42).lineWidth(0.4).stroke(C.slate200);

    // Footer
    const footY = PH - 30;
    doc.moveTo(M, footY).lineTo(PW - M, footY).lineWidth(0.4).stroke(C.slate200);
    doc.fillColor(C.slate400).fontSize(6.5).font('Helvetica')
       .text('(c) 2026 Ethnotech Academy & Ethops Platform. Confidential. All rights reserved.', M, footY + 6, { width: CW * 0.7 });
    
    doc.fillColor(C.slate500).fontSize(7).font('Helvetica-Bold')
       .text(`Page ${i + 1} of ${totalPages}`, PW - M - 60, footY + 6, { width: 60, align: 'right' });
}

// Finalize
doc.end();
console.log('Comparison PDF generated successfully at:', outputPath);
