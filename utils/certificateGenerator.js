const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Generates a premium PDF certificate buffer for a passed student.
 * Returns a Promise<Buffer>.
 */
const generateCertificate = ({ studentName, rollNumber, examTitle, courseName, collegeName, score, totalMarks, percentage, date }) => {
    return new Promise((resolve, reject) => {
        // Landscape A4: 841.89 x 595.28 points
        const doc = new PDFDocument({ 
            size: 'A4', 
            layout: 'landscape', 
            margins: { top: 0, bottom: 0, left: 0, right: 0 } 
        });
        
        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const w = doc.page.width;
        const h = doc.page.height;

        // Path to images
        const imageDir = path.join('e:', 'Eth_Quiz', 'Images');
        const logoPath = path.join(imageDir, 'New-logo-1.png');
        const skillIndiaPath = path.join(imageDir, 'Skill-India-1.png');
        const nsdcPath = path.join(imageDir, 'NSDC.png');

        // --- BACKGROUND ---
        // Solid premium off-white/cream background
        doc.rect(0, 0, w, h).fill('#FCFCFA');
        
        // --- GEOMETRIC BACKGROUND ACCENTS (Modern Corporate Style) ---
        doc.save();
        // Top Left primary swoosh
        doc.moveTo(0, 0)
           .lineTo(250, 0)
           .lineTo(0, 250)
           .fill('#002B5B');
        
        // Top left secondary gold accent
        doc.moveTo(0, 250)
           .lineTo(250, 0)
           .lineTo(300, 0)
           .lineTo(0, 300)
           .fill('#D4AF37');

        // Bottom Right primary swoosh
        doc.moveTo(w, h)
           .lineTo(w - 350, h)
           .lineTo(w, h - 350)
           .fill('#002B5B');

        // Bottom Right secondary gold accent
        doc.moveTo(w - 350, h)
           .lineTo(w, h - 350)
           .lineTo(w, h - 400)
           .lineTo(w - 400, h)
           .fill('#D4AF37');
        doc.restore();

        // Main Inner Border (Sleek offset border)
        const margin = 40;
        doc.lineWidth(1).rect(margin, margin, w - margin * 2, h - margin * 2).stroke('#002B5B');
        doc.lineWidth(3).rect(margin + 5, margin + 5, w - (margin + 5) * 2, h - (margin + 5) * 2).stroke('#D4AF37');

        // --- HEADER LOGOS ---
        // Center-Top Logo
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, w / 2 - 80, 50, { width: 160 });
        } else {
            doc.fontSize(28).fill('#002B5B').font('Helvetica-Bold').text('ETHNOTECH ACADEMY', 0, 70, { align: 'center' });
        }

        // --- CERTIFICATE TEXT ---
        doc.fontSize(52).fill('#002B5B').font('Helvetica-Bold').text('CERTIFICATE', 0, 160, { align: 'center', characterSpacing: 8 });
        doc.fontSize(16).fill('#D4AF37').font('Helvetica').text('OF EXCELLENCE & COMPLETION', 0, 215, { align: 'center', characterSpacing: 6 });

        // --- RECIPIENT ---
        doc.fontSize(12).fill('#4A5568').font('Helvetica').text('PROUDLY PRESENTED TO', 0, 265, { align: 'center', characterSpacing: 2 });
        
        const safeStudentName = (studentName || 'Student').toString().toUpperCase();
        doc.fontSize(38).fill('#1A202C').font('Helvetica-Bold').text(safeStudentName, 0, 290, { align: 'center' });
        
        // Horizontal rule under name
        const nameWidth = doc.widthOfString(safeStudentName);
        doc.moveTo(w / 2 - nameWidth / 2 - 20, 335).lineTo(w / 2 + nameWidth / 2 + 20, 335).lineWidth(2).stroke('#D4AF37');

        doc.fontSize(11).fill('#718096').font('Helvetica').text(`ID / ROLL: ${rollNumber || 'N/A'}`, 0, 345, { align: 'center', characterSpacing: 1 });

        // --- ACHIEVEMENT DETAILS ---
        doc.fontSize(14).fill('#4A5568').font('Helvetica').text('For the successful completion and demonstrated mastery in:', 0, 385, { align: 'center' });

        const safeExamTitle = (examTitle || 'Assessment').toString().toUpperCase();
        doc.fontSize(22).fill('#002B5B').font('Helvetica-Bold').text(`"${safeExamTitle}"`, 0, 410, { align: 'center' });

        // --- SCORES ---
        doc.fontSize(13).fill('#2D3748').font('Helvetica-Bold')
           .text(`SCORE ACHIEVED: ${percentage}%`, w / 2 - 150, 450, { width: 300, align: 'center' });

        // --- FOOTER SECTION ---
        const footerY = h - 90;
        
        // Date
        doc.fontSize(10).fill('#718096').font('Helvetica-Bold').text('DATE ISSUED', 120, footerY);
        doc.fontSize(12).fill('#1A202C').font('Helvetica').text(date || new Date().toLocaleDateString('en-IN'), 120, footerY + 15);
        doc.moveTo(120, footerY + 10).lineTo(220, footerY + 10).lineWidth(1).stroke('#CBD5E0');

        // Verification ID
        const certHash = require('crypto').randomBytes(4).toString('hex').toUpperCase();
        doc.fontSize(9).fill('#A0AEC0').font('Helvetica-Bold').text(`VERIFICATION ID: ETX-${certHash}`, 0, footerY - 5, { align: 'center', characterSpacing: 1 });
        doc.fontSize(8).fill('#CBD5E0').font('Helvetica').text('Verify at secure.ethnotech.in', 0, footerY + 8, { align: 'center' });

        // Signatory
        doc.fontSize(10).fill('#718096').font('Helvetica-Bold').text('PROGRAM DIRECTOR', w - 240, footerY, { width: 120, align: 'right' });
        doc.fontSize(12).fill('#1A202C').font('Helvetica').text('Ethnotech Academy', w - 240, footerY + 15, { width: 120, align: 'right' });
        doc.moveTo(w - 240, footerY + 10).lineTo(w - 120, footerY + 10).lineWidth(1).stroke('#CBD5E0');

        // Very bottom partner logos (centered under verification text)
        const logoSize = 35;
        const logoSpacing = 160;
        const logosY = h - 65;

        if (fs.existsSync(skillIndiaPath)) {
            doc.image(skillIndiaPath, w / 2 - logoSpacing, logosY, { height: logoSize });
        }
        if (fs.existsSync(nsdcPath)) {
            doc.image(nsdcPath, w / 2 + logoSpacing - (logoSize * 1.5), logosY, { height: logoSize });
        }

        doc.end();
    });
};

module.exports = { generateCertificate };
