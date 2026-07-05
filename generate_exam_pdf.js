const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const Exam = require('./models/Exam');
const Question = require('./models/Question');
const College = require('./models/College');
const Course = require('./models/Course');

const C = {
    primary:    '#004AAD', // Ethnotech Navy
    secondary:  '#059669', // Emerald Green
    textDark:   '#0F172A', // Slate 900
    textMedium: '#334155', // Slate 700
    textLight:  '#64748B', // Slate 500
    border:     '#CBD5E1', // Slate 300
    bgLight:    '#F8FAFC', // Slate 50
    white:      '#FFFFFF'
};

const PW = 595.28; // A4 Width
const PH = 841.89; // A4 Height
const M  = 54;     // Margins
const CW = PW - M * 2; // Content Width

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected successfully!');

        // Find the exam
        const exam = await Exam.findOne({ title: /JFSD MID EXAM -1/i }).populate('courseId');
        if (!exam) {
            console.error('Exam "JFSD MID EXAM -1" not found in the DB.');
            process.exit(1);
        }

        console.log(`Generating PDF for: ${exam.title}`);

        // Fetch questions
        const questions = await Question.find({ examId: exam._id }).sort({ order: 1 });
        console.log(`Found ${questions.length} questions to render.`);

        // Create PDF
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: M, bottom: M, left: M, right: M },
            bufferPages: true
        });

        const outputFilename = 'JFSD_MID_EXAM_1_Question_Paper.pdf';
        const outputPath = path.join(__dirname, '..', outputFilename);
        const writeStream = fs.createWriteStream(outputPath);
        doc.pipe(writeStream);

        // ═══════════════════════════════════════════════════════════════════════════════
        // PAGE 1 HEADER & CANDIDATE DETAILS
        // ═══════════════════════════════════════════════════════════════════════════════

        // Main Institution Header
        doc.fillColor(C.primary)
           .font('Helvetica-Bold')
           .fontSize(16)
           .text('ETHNOTECH ACADEMY', { align: 'center' });

        doc.fillColor(C.textLight)
           .font('Helvetica')
           .fontSize(9)
           .text('ASSESSMENT MANAGEMENT PLATFORM', { align: 'center' });

        doc.moveDown(0.8);

        // Title of Exam
        doc.fillColor(C.textDark)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text(exam.title.trim().toUpperCase(), { align: 'center' });

        // Course details if available
        if (exam.courseId && exam.courseId.name) {
            doc.fillColor(C.textMedium)
               .font('Helvetica-Oblique')
               .fontSize(10)
               .text(`Course: ${exam.courseId.name} (${exam.courseId.code || 'N/A'})`, { align: 'center' });
        }
        
        doc.moveDown(1);

        // Metadata grid (Duration, Total Marks, etc.)
        const gridY = doc.y;
        doc.rect(M, gridY, CW, 36)
           .fillAndStroke(C.bgLight, C.border);

        doc.fillColor(C.textDark).font('Helvetica-Bold').fontSize(9.5);
        doc.text('DURATION:', M + 15, gridY + 13, { lineBreak: false });
        doc.font('Helvetica').text(` ${exam.duration} Minutes`, M + 80, gridY + 13, { lineBreak: false });

        doc.font('Helvetica-Bold').text('TOTAL MARKS:', M + 200, gridY + 13, { lineBreak: false });
        doc.font('Helvetica').text(` ${exam.totalMarks} Marks`, M + 285, gridY + 13, { lineBreak: false });

        doc.font('Helvetica-Bold').text('QUESTIONS:', M + 380, gridY + 13, { lineBreak: false });
        doc.font('Helvetica').text(` ${questions.length}`, M + 455, gridY + 13);

        doc.y = gridY + 50;

        // Candidate details section
        doc.fillColor(C.textDark).font('Helvetica-Bold').fontSize(10).text('CANDIDATE DETAILS', M);
        
        const detailsY = doc.y + 5;
        doc.rect(M, detailsY, CW, 50).stroke(C.border);
        
        // Draw vertical division line
        doc.moveTo(M + CW / 2, detailsY).lineTo(M + CW / 2, detailsY + 50).stroke(C.border);
        
        // Draw horizontal division line
        doc.moveTo(M, detailsY + 25).lineTo(M + CW, detailsY + 25).stroke(C.border);

        doc.fontSize(8.5).fillColor(C.textMedium);
        doc.font('Helvetica-Bold').text('Candidate Name: _______________________', M + 10, detailsY + 8);
        doc.text('Roll Number: ________________________', M + CW / 2 + 10, detailsY + 8);
        
        doc.text('Batch / College: _______________________', M + 10, detailsY + 33);
        doc.text('Signature: __________________________', M + CW / 2 + 10, detailsY + 33);

        doc.y = detailsY + 65;

        // Exam Instructions
        doc.fillColor(C.textDark).font('Helvetica-Bold').fontSize(10).text('INSTRUCTIONS');
        doc.moveDown(0.3);
        doc.fillColor(C.textMedium).font('Helvetica').fontSize(9);
        const instructionsText = exam.instructions || '1. Read each question carefully before answering.\n2. All questions are compulsory.\n3. Make sure to complete the exam within the allocated duration of ' + exam.duration + ' minutes.\n4. Avoid any form of malpractice; violators will be disqualified.';
        doc.text(instructionsText, { width: CW, align: 'left', lineGap: 3 });

        doc.moveDown(1.5);
        doc.moveTo(M, doc.y).lineTo(PW - M, doc.y).strokeColor(C.primary).lineWidth(1).stroke();
        doc.moveDown(1);

        // ═══════════════════════════════════════════════════════════════════════════════
        // RENDER QUESTIONS
        // ═══════════════════════════════════════════════════════════════════════════════
        
        function getQuestionHeight(q, idx) {
            let h = 0;
            const typeLabel = q.type === 'multiple_correct' ? 'Multiple Correct' 
                            : q.type === 'single_correct' ? 'Single Correct' 
                            : q.type === 'true_false' ? 'True/False' 
                            : q.type === 'fill_blank' ? 'Fill in the Blank' 
                            : 'Numeric';
                            
            const qText = `${idx}. [${typeLabel}] ${q.text} (${q.points} Mark${q.points > 1 ? 's' : ''})`;
            h += doc.fontSize(10).heightOfString(qText, { width: CW });
            h += 8; // gap after text
            
            if (q.type === 'single_correct' || q.type === 'multiple_correct' || q.type === 'true_false') {
                const choices = q.options?.choices || [];
                choices.forEach((choice, cIdx) => {
                    const charPrefix = String.fromCharCode(65 + cIdx);
                    const optText = `[ ]  ${charPrefix}. ${choice.text}`;
                    h += doc.fontSize(9).heightOfString(optText, { width: CW - 20 });
                    h += 4; // gap between choices
                });
            } else if (q.type === 'fill_blank') {
                h += 20; // text field space
            } else if (q.type === 'numeric') {
                h += 20; // numeric input space
            }
            h += 15; // gap between questions
            return h;
        }

        questions.forEach((q, index) => {
            const idx = index + 1;
            const qHeight = getQuestionHeight(q, idx);

            // Safe page break check
            if (doc.y + qHeight > PH - M - 20) {
                doc.addPage();
            }

            const typeLabel = q.type === 'multiple_correct' ? 'Multiple Correct' 
                            : q.type === 'single_correct' ? 'Single Correct' 
                            : q.type === 'true_false' ? 'True/False' 
                            : q.type === 'fill_blank' ? 'Fill in the Blank' 
                            : 'Numeric';

            // Question Header
            doc.fillColor(C.textDark).font('Helvetica-Bold').fontSize(10);
            doc.text(`${idx}. `, { continued: true });
            doc.fillColor(C.primary).text(`[${typeLabel}] `, { continued: true });
            doc.fillColor(C.textDark).font('Helvetica').text(q.text, { continued: true });
            doc.font('Helvetica-Bold').fillColor(C.secondary).text(`  (${q.points} Mark${q.points > 1 ? 's' : ''})`);
            
            doc.moveDown(0.5);

            // Choices/Options
            doc.fillColor(C.textMedium).font('Helvetica').fontSize(9.5);
            if (q.type === 'single_correct' || q.type === 'multiple_correct' || q.type === 'true_false') {
                const choices = q.options?.choices || [];
                choices.forEach((choice, cIdx) => {
                    const charPrefix = String.fromCharCode(65 + cIdx);
                    const prefix = q.type === 'multiple_correct' ? ' [ ] ' : ' ( ) ';
                    
                    doc.text(`${prefix} ${charPrefix}.  ${choice.text}`, M + 15, doc.y, { width: CW - 20 });
                    doc.moveDown(0.35);
                });
            } else if (q.type === 'fill_blank') {
                doc.text('Answer: ___________________________________________________________', M + 15, doc.y);
                doc.moveDown(0.6);
            } else if (q.type === 'numeric') {
                doc.text('Answer: _______________________ (Numeric value)', M + 15, doc.y);
                doc.moveDown(0.6);
            }

            doc.y += 8; // spacing below question
        });

        // ═══════════════════════════════════════════════════════════════════════════════
        // FOOTERS AND PAGE NUMBERS (Multi-pass rendering)
        // ═══════════════════════════════════════════════════════════════════════════════
        
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            
            // Draw Footer
            doc.fillColor(C.textLight)
               .font('Helvetica')
               .fontSize(8);
            
            // Thin line above footer
            doc.moveTo(M, PH - 45).lineTo(PW - M, PH - 45).strokeColor(C.border).lineWidth(0.5).stroke();
            
            // Footer text
            doc.text('Ethnotech Academy — Assessment Platform', M, PH - 38);
            doc.text(`Page ${i + 1} of ${pages.count}`, PW - M - 100, PH - 38, { width: 100, align: 'right' });

            // Draw Header on pages > 0
            if (i > 0) {
                doc.fillColor(C.primary)
                   .font('Helvetica-Bold')
                   .fontSize(8)
                   .text('ETHNOTECH ACADEMY — ASSESSMENT MANAGEMENT PLATFORM', M, 30);
                doc.fillColor(C.textLight)
                   .font('Helvetica')
                   .fontSize(8)
                   .text('JFSD MID EXAM -1', PW - M - 150, 30, { width: 150, align: 'right' });
                doc.moveTo(M, 42).lineTo(PW - M, 42).strokeColor(C.border).lineWidth(0.5).stroke();
            }
        }

        doc.end();

        writeStream.on('finish', () => {
            console.log(`PDF created successfully at: ${outputPath}`);
            mongoose.disconnect();
        });

    } catch (err) {
        console.error('Error generating PDF:', err);
        mongoose.disconnect();
    }
}

main();
