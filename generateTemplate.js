/**
 * Run this once to generate the bulk import template Excel file.
 * Usage: node generateTemplate.js
 * Output: bulk_import_template.xlsx (place in server/public or serve statically)
 */
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');

    sheet.columns = [
        { header: 'Question Text *', key: 'text', width: 50 },
        { header: 'Type *', key: 'type', width: 20 },
        { header: 'Option A', key: 'optA', width: 25 },
        { header: 'Option B', key: 'optB', width: 25 },
        { header: 'Option C', key: 'optC', width: 25 },
        { header: 'Option D', key: 'optD', width: 25 },
        { header: 'Correct Answer *', key: 'correct', width: 30 },
        { header: 'Marks', key: 'marks', width: 10 },
        { header: 'Difficulty', key: 'difficulty', width: 15 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004AAD' } };
    headerRow.height = 22;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.commit();

    // Add example rows
    const examples = [
        ['What is the capital of India?', 'single_correct', 'Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Delhi', 2, 'easy'],
        ['Which of the following are programming languages?', 'multiple_correct', 'Python', 'Java', 'HTML', 'English', 'Python,Java', 3, 'medium'],
        ['Is the sky blue?', 'true_false', '', '', '', '', 'True', 1, 'easy'],
        ['The speed of light is ___ km/s.', 'fill_blank', '', '', '', '', '3,00,000', 2, 'hard'],
        ['What is 2 + 2?', 'numeric', '', '', '', '', '4', 1, 'easy'],
    ];

    examples.forEach((row, i) => {
        const r = sheet.addRow(row);
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };
        r.commit();
    });

    // Add instructions sheet
    const infoSheet = workbook.addWorksheet('Instructions');
    infoSheet.getCell('A1').value = 'BULK IMPORT TEMPLATE — INSTRUCTIONS';
    infoSheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF004AAD' } };
    
    const instructions = [
        ['', ''],
        ['Column', 'Description'],
        ['Question Text', 'The question text. Required.'],
        ['Type', 'One of: single_correct, multiple_correct, true_false, fill_blank, numeric'],
        ['Option A-D', 'Answer choices. Leave blank for fill_blank and numeric types.'],
        ['Correct Answer', 'For single_correct/true_false: the exact text of the correct option.\nFor multiple_correct: comma-separated correct options (e.g. "Python,Java").\nFor fill_blank/numeric: the correct answer value.'],
        ['Marks', 'Points for this question. Default: 1'],
        ['Difficulty', 'One of: easy, medium, hard. Default: medium'],
    ];

    instructions.forEach((row, i) => {
        const r = infoSheet.addRow(row);
        if (i === 2) {
            r.font = { bold: true };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EEFF' } };
        }
        r.commit();
    });
    infoSheet.getColumn(1).width = 20;
    infoSheet.getColumn(2).width = 80;

    const outPath = path.join(__dirname, 'bulk_import_template.xlsx');
    await workbook.xlsx.writeFile(outPath);
    console.log('✅  Template saved to:', outPath);
}

generate().catch(console.error);
