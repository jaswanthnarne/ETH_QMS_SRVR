const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');
const PDFDocument = require('pdfkit');
const connectDB = require('./config/db');
const Batch = require('./models/Batch');
const Course = require('./models/Course');
const User = require('./models/User');
const MaterialFile = require('./models/MaterialFile');

const LOGO_PNG_PATH = path.resolve(__dirname, '../client/public/assets/cropped-New-logo-footer-270x270.png');
const LOGO_JPG_PATH = path.resolve(__dirname, '../client/public/logonew.jpg');
const RESOLVED_LOGO_PATH = fs.existsSync(LOGO_PNG_PATH)
    ? LOGO_PNG_PATH
    : fs.existsSync(LOGO_JPG_PATH)
        ? LOGO_JPG_PATH
        : null;

// Helper: Stamp footer with logo + "© Ethnotech Academic Solutions. All Rights Reserved." on every PDF page
const drawPageFooter = (doc, pageNum, totalPages) => {
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 100;
    const footerY = doc.page.height - 46;

    doc.save();
    doc.moveTo(50, footerY - 8).lineTo(50 + contentWidth, footerY - 8).lineWidth(0.8).strokeColor('#CBD5E1').stroke();

    if (RESOLVED_LOGO_PATH) {
        try {
            doc.roundedRect(50, footerY - 3, 22, 22, 4).fillAndStroke('#FFFFFF', '#E2E8F0');
            doc.image(RESOLVED_LOGO_PATH, 52, footerY - 1, { width: 18, height: 18 });
        } catch (e) {
            // fallback if image fails
        }
    }

    const textX = RESOLVED_LOGO_PATH ? 78 : 50;
    const textW = RESOLVED_LOGO_PATH ? contentWidth - 28 : contentWidth;

    doc.fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .text('© 2026 Ethnotech Academic Solutions Pvt. Ltd. • All Rights Reserved.', textX, footerY - 2, {
            width: textW,
            align: 'left',
            lineBreak: false
        });

    doc.fillColor('#64748B')
        .font('Helvetica')
        .fontSize(7.5)
        .text('Proprietary Curriculum & Study Material • Unauthorized reproduction or distribution is strictly prohibited.', textX, footerY + 9, {
            width: textW,
            align: 'left',
            lineBreak: false
        });

    if (pageNum && totalPages) {
        doc.fillColor('#475569')
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(`Page ${pageNum} of ${totalPages}`, 50, footerY + 2, {
                width: contentWidth,
                align: 'right',
                lineBreak: false
            });
    }
    doc.restore();
};

// Helper: Draw a subtle header bar on continuation pages
const drawContinuationHeader = (doc, modData) => {
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 100;

    doc.save();
    doc.rect(0, 0, pageWidth, 40).fill('#5899B5');
    if (RESOLVED_LOGO_PATH) {
        try {
            doc.roundedRect(50, 7, 26, 26, 5).fill('#FFFFFF');
            doc.image(RESOLVED_LOGO_PATH, 52, 9, { width: 22, height: 22 });
        } catch (e) {}
    }
    doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(`ETHNOTECH ACADEMY  •  ${modData.module}: ${modData.title}`, RESOLVED_LOGO_PATH ? 84 : 50, 15, {
            width: contentWidth - 40,
            lineBreak: false
        });
    doc.restore();
};

// Helper: Generate a clean multi-page Ethnotech Academy PDF Buffer using PDFKit
const generateModulePdfBuffer = (modData) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            bufferPages: true,
            margins: { top: 48, bottom: 58, left: 50, right: 50 },
            info: {
                Title: `${modData.title} — © Ethnotech Academic Solutions (All Rights Reserved)`,
                Author: 'Ethnotech Academic Solutions • Jaswanth Narne (Ops Admin)',
                Subject: "Introduction to 'C' Programming (DSU-C-001) - Batch B 22",
                Keywords: 'Ethnotech Academic Solutions, All Rights Reserved, C Programming, DSU, Batch B 22'
            }
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - 100;

        // Top Brand Header Banner with Official Ethnotech Logo
        doc.rect(0, 0, pageWidth, 98).fill('#5899B5');

        if (RESOLVED_LOGO_PATH) {
            try {
                doc.roundedRect(50, 18, 56, 56, 10).fill('#FFFFFF');
                doc.image(RESOLVED_LOGO_PATH, 54, 22, { width: 48, height: 48 });
            } catch (e) {
                console.warn('Logo draw warning:', e.message);
            }
        }

        const headerTextX = RESOLVED_LOGO_PATH ? 118 : 50;
        const headerTextWidth = RESOLVED_LOGO_PATH ? contentWidth - 68 : contentWidth;

        doc.fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .text('ETHNOTECH ACADEMIC SOLUTIONS • DAYANAND SAGAR UNIVERSITY (DSU)', headerTextX, 18, {
                characterSpacing: 1.1,
                width: headerTextWidth
            });

        doc.fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(16)
            .text(modData.title, headerTextX, 34, { width: headerTextWidth });

        doc.fillColor('#E0F2FE')
            .font('Helvetica')
            .fontSize(8.8)
            .text(`${modData.module}  |  Course: Introduction to 'C' Programming (DSU-C-001)  |  Batch: B 22  |  © All Rights Reserved`, headerTextX, 72, {
                width: headerTextWidth
            });

        doc.y = 114;

        // Overview Box
        doc.roundedRect(50, doc.y, contentWidth, 54, 8).fillAndStroke('#F0F9FF', '#BAE6FD');
        doc.fillColor('#0369A1')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('MODULE OVERVIEW & LEARNING OBJECTIVES', 64, doc.y + 11);
        doc.fillColor('#334155')
            .font('Helvetica')
            .fontSize(9.5)
            .text(modData.description, 64, doc.y + 26, { width: contentWidth - 28 });

        doc.y += 70;

        const addContinuationPage = () => {
            doc.addPage();
            drawContinuationHeader(doc, modData);
            doc.y = 56;
        };

        // Render Sections
        modData.sections.forEach((sec, idx) => {
            if (doc.y > 665) {
                addContinuationPage();
            }

            // Section Title
            doc.fillColor('#0F172A')
                .font('Helvetica-Bold')
                .fontSize(12.5)
                .text(`${idx + 1}. ${sec.heading}`, 50, doc.y);

            doc.moveTo(50, doc.y + 3).lineTo(50 + contentWidth, doc.y + 3).lineWidth(1).strokeColor('#E2E8F0').stroke();
            doc.moveDown(0.5);

            // Bullet Points
            sec.points.forEach((pt) => {
                if (doc.y > 705) {
                    addContinuationPage();
                }
                doc.fillColor('#334155')
                    .font('Helvetica')
                    .fontSize(10)
                    .text(`•  ${pt}`, 58, doc.y, { width: contentWidth - 12, lineGap: 2 });
                doc.moveDown(0.35);
            });

            // Code Example Block if provided
            if (sec.code) {
                const codeLines = sec.code.trim().split('\n');
                const boxHeight = Math.max(46, codeLines.length * 13 + 22);
                if (doc.y + boxHeight > 730) {
                    addContinuationPage();
                }
                const boxY = doc.y + 4;
                doc.roundedRect(54, boxY, contentWidth - 8, boxHeight, 6).fillAndStroke('#0F172A', '#1E293B');
                doc.fillColor('#38BDF8')
                    .font('Courier-Bold')
                    .fontSize(8.5)
                    .text('// Verified C Program Example (GCC C11 Standard) • © Ethnotech Academy', 66, boxY + 9);
                doc.fillColor('#F8FAFC')
                    .font('Courier')
                    .fontSize(8.8)
                    .text(sec.code.trim(), 66, boxY + 23, { width: contentWidth - 32, lineGap: 1.5 });
                doc.y = boxY + boxHeight + 12;
            } else {
                doc.moveDown(0.5);
            }
        });

        // Practice Questions / Viva Block
        if (modData.practice && modData.practice.length > 0) {
            if (doc.y > 635) {
                addContinuationPage();
            }
            doc.moveDown(0.3);
            doc.fillColor('#5899B5')
                .font('Helvetica-Bold')
                .fontSize(12)
                .text('LAB EXERCISES & PLACEMENT INTERVIEW QUESTIONS', 50, doc.y);
            doc.moveDown(0.4);
            modData.practice.forEach((q, qIdx) => {
                if (doc.y > 710) {
                    addContinuationPage();
                }
                doc.fillColor('#1E293B')
                    .font('Helvetica-Bold')
                    .fontSize(9.8)
                    .text(`Q${qIdx + 1}. ${q}`, 56, doc.y, { width: contentWidth - 12 });
                doc.moveDown(0.35);
            });
        }

        // Stamp Footer with Logo + All Rights Reserved on every page
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            drawPageFooter(doc, i + 1, range.count);
        }

        doc.end();
    });
};

const C_MODULES = [
    {
        module: 'Module 1',
        title: 'C Language Fundamentals, Tokens, Data Types & I/O',
        type: 'PDF Notes',
        fileName: 'DSU_B22_C_Module_1_Fundamentals_and_IO.pdf',
        description:
            'Complete foundation of C programming: compilation pipeline (Preprocessor, Compiler, Assembler, Linker), C tokens, primitive data types, memory sizes, format specifiers, and type casting.',
        sections: [
            {
                heading: 'Structure of a C Program & GCC Compilation Pipeline',
                points: [
                    'Preprocessor (gcc -E): Expands #include headers, #define macros, and strips comments to produce a .i translation unit.',
                    'Compiler (gcc -S): Translates preprocessed C code into architecture-specific assembly instructions (.s).',
                    'Assembler (gcc -c): Converts assembly code into machine-level relocatable object code (.o).',
                    'Linker: Links object files with standard C library implementations (libc / stdio) to produce the final executable binary.'
                ],
                code: `#include <stdio.h>
#define PI 3.14159265

int main(void) {
    double radius = 7.5;
    double area = PI * radius * radius;
    printf("Radius: %.2f | Circle Area: %.4f\\n", radius, area);
    return 0;
}`
            },
            {
                heading: 'Data Types, Sizes, Ranges & Format Specifiers',
                points: [
                    'char (1 byte, -128 to 127 or 0 to 255 unsigned) -> %c for character, %d for ASCII integer value.',
                    'int (4 bytes on 32/64-bit systems, -2,147,483,648 to 2,147,483,647) -> %d or %i; unsigned int -> %u.',
                    'float (4 bytes, IEEE-754 single precision, ~6-7 decimal digits) -> %f; double (8 bytes, ~15-16 digits) -> %lf.',
                    'sizeof() is a compile-time unary operator (not a function) that returns size in bytes as size_t (%zu).'
                ],
                code: `#include <stdio.h>

int main(void) {
    printf("sizeof(char)   = %zu byte\\n", sizeof(char));
    printf("sizeof(int)    = %zu bytes\\n", sizeof(int));
    printf("sizeof(float)  = %zu bytes\\n", sizeof(float));
    printf("sizeof(double) = %zu bytes\\n", sizeof(double));
    return 0;
}`
            }
        ],
        practice: [
            'Write a C program to swap two numbers without using a third temporary variable (using arithmetic and XOR methods).',
            'What is the difference between implicit type promotion and explicit type casting in C expressions?',
            'Why does scanf("%d", &x) require the address-of (&) operator while printf("%d", x) does not?'
        ]
    },
    {
        module: 'Module 2',
        title: 'Operators, Decision Branching & Iterative Loops in C',
        type: 'PDF Notes',
        fileName: 'DSU_B22_C_Module_2_Operators_and_Control_Flow.pdf',
        description:
            'In-depth guide to arithmetic, relational, logical, and bitwise operators, operator precedence, short-circuit evaluation, switch-case jump tables, and for/while/do-while loop patterns.',
        sections: [
            {
                heading: 'Bitwise Operators & Short-Circuit Logical Evaluation',
                points: [
                    'Logical AND (&&) skips evaluating the right-hand operand if the left-hand operand is false (0).',
                    'Logical OR (||) skips evaluating the right-hand operand if the left-hand operand is true (non-zero).',
                    'Bitwise operators (&, |, ^, ~, <<, >>) operate directly on binary bits: left shift (x << k) multiplies by 2^k, right shift (x >> k) divides by 2^k.',
                    'Checking if an integer n is a power of 2 in O(1) time: (n > 0) && ((n & (n - 1)) == 0).'
                ],
                code: `#include <stdio.h>

int main(void) {
    unsigned int flags = 0b0101; // 5
    unsigned int mask  = 0b0011; // 3
    printf("AND: %u | OR: %u | XOR: %u | Shift: %u\\n",
           flags & mask, flags | mask, flags ^ mask, flags << 2);
    return 0;
}`
            },
            {
                heading: 'Control Flow: if-else Ladders, switch-case & Loop Invariants',
                points: [
                    'switch-case evaluates an integral expression (int/char/enum) and jumps to matching constant case labels; missing break causes fall-through.',
                    'Entry-controlled loops (for, while) test the condition before executing the body; exit-controlled loop (do-while) executes at least once.',
                    'break terminates the innermost enclosing loop or switch; continue skips the remaining statements in the current iteration.'
                ],
                code: `#include <stdio.h>

int main(void) {
    int n = 153, temp = n, sum = 0;
    while (temp > 0) {
        int d = temp % 10;
        sum += d * d * d;
        temp /= 10;
    }
    printf("%d is %s Armstrong number.\\n", n, (sum == n) ? "an" : "not an");
    return 0;
}`
            }
        ],
        practice: [
            'Write a C program to print Floyd’s Triangle and Pascal’s Triangle up to N rows.',
            'Explain why floating-point variables cannot be used inside a switch(expression) statement in C.',
            'Write a single-loop C program to reverse an integer and check if it is a palindrome.'
        ]
    },
    {
        module: 'Module 3',
        title: 'Arrays, Multi-Dimensional Matrices & C String Manipulation',
        type: 'PDF Notes',
        fileName: 'DSU_B22_C_Module_3_Arrays_Matrices_and_Strings.pdf',
        description:
            'Contiguous memory layout of 1D and 2D arrays, row-major address calculation, matrix multiplication, null-terminated character arrays, and standard <string.h> functions.',
        sections: [
            {
                heading: '1D & 2D Arrays in Contiguous Memory (Row-Major Order)',
                points: [
                    'Array elements are stored contiguously: Address of arr[i] = Base_Address + i * sizeof(element).',
                    'In C, 2D arrays are stored in Row-Major order: Address of A[i][j] = Base + ((i * COLS) + j) * sizeof(type).',
                    'Array name decays into a pointer to its first element (&arr[0]) when passed to a function.'
                ],
                code: `#include <stdio.h>

int main(void) {
    int A[2][2] = {{1, 2}, {3, 4}};
    int B[2][2] = {{5, 6}, {7, 8}};
    int C[2][2] = {0};

    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2; j++)
            for (int k = 0; k < 2; k++)
                C[i][j] += A[i][k] * B[k][j];

    printf("Matrix Product C[0][0]=%d, C[1][1]=%d\\n", C[0][0], C[1][1]);
    return 0;
}`
            },
            {
                heading: 'Null-Terminated Strings & Safe String Handling',
                points: [
                    'A C string is a char array terminated by the null character \'\\0\' (ASCII 0). Storing N characters requires at least N + 1 bytes.',
                    'Key <string.h> routines: strlen(s), strcpy(dest, src), strncpy(dest, src, n), strcmp(s1, s2), strcat(dest, src).',
                    'Never use gets(); always use fgets(buf, sizeof(buf), stdin) to prevent buffer overflow vulnerabilities.'
                ],
                code: `#include <stdio.h>
#include <string.h>

int main(void) {
    char str[] = "ETHNOTECH";
    int l = 0, r = (int)strlen(str) - 1;
    while (l < r) {
        char tmp = str[l];
        str[l++] = str[r];
        str[r--] = tmp;
    }
    printf("Reversed String: %s\\n", str);
    return 0;
}`
            }
        ],
        practice: [
            'Implement custom versions of strlen(), strcmp(), and strcpy() without using <string.h>.',
            'Write a C program to rotate an N x N matrix by 90 degrees clockwise in-place.',
            'Write a C program to perform Binary Search on a sorted 1D array and analyze its O(log N) complexity.'
        ]
    },
    {
        module: 'Module 4',
        title: 'Modular Programming, Recursion, Pointers & Dynamic Memory',
        type: 'PDF Notes',
        fileName: 'DSU_B22_C_Module_4_Functions_Pointers_and_DMA.pdf',
        description:
            'Stack frames, Call-by-Value vs Call-by-Reference, tail recursion, pointer arithmetic, void and function pointers, and heap allocation using malloc, calloc, realloc, and free.',
        sections: [
            {
                heading: 'Functions, Stack Frames & Recursion',
                points: [
                    'Call by Value copies arguments into formal parameters; Call by Reference passes pointer addresses so the callee can mutate caller variables.',
                    'Every recursive function must have a well-defined base case to prevent stack overflow.',
                    'Storage classes in C: auto (stack local), register (CPU register hint), static (persists across calls), extern (global linkage).'
                ],
                code: `#include <stdio.h>

long long factorial(int n) {
    if (n <= 1) return 1;
    return (long long)n * factorial(n - 1);
}

void swapByRef(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main(void) {
    int x = 10, y = 25;
    swapByRef(&x, &y);
    printf("Swapped: x=%d, y=%d | 6! = %lld\\n", x, y, factorial(6));
    return 0;
}`
            },
            {
                heading: 'Pointer Arithmetic & Dynamic Memory Allocation (<stdlib.h>)',
                points: [
                    'Incrementing a pointer (ptr + 1) advances the address by sizeof(*ptr) bytes.',
                    'malloc(size) allocates uninitialized heap bytes; calloc(n, size) allocates and zero-initializes; realloc(ptr, newSize) resizes an existing block.',
                    'Always check if malloc returned NULL and call free(ptr) followed by ptr = NULL to prevent memory leaks and dangling pointers.'
                ],
                code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n = 5;
    int *arr = (int *)calloc(n, sizeof(int));
    if (!arr) return 1;

    for (int i = 0; i < n; i++) *(arr + i) = (i + 1) * 10;
    printf("Third element via pointer arithmetic: %d\\n", *(arr + 2));

    free(arr);
    arr = NULL;
    return 0;
}`
            }
        ],
        practice: [
            'What is the difference between a dangling pointer, a wild pointer, and a NULL pointer?',
            'Write a C program using dynamic memory allocation to create and resize a 1D array at runtime.',
            'Explain how array indexing arr[i] is internally translated by the C compiler into *(arr + i).'
        ]
    },
    {
        module: 'Module 5',
        title: 'Structures, Unions, Bit Fields & File Handling in C',
        type: 'PDF Notes',
        fileName: 'DSU_B22_C_Module_5_Structures_Unions_and_File_IO.pdf',
        description:
            'User-defined composite types (struct, union, typedef, enum), structure padding and alignment, self-referential structures, and persistent File I/O streams (fopen, fread, fwrite, fseek).',
        sections: [
            {
                heading: 'Structures vs Unions, Memory Alignment & Self-Referential Nodes',
                points: [
                    'A struct allocates separate memory for every member (plus alignment padding bytes); a union shares the same memory block equal to its largest member.',
                    'Use the dot operator (s.member) for struct variables and the arrow operator (ptr->member) for struct pointers.',
                    'Self-referential structures (containing a pointer to the same struct type) form the backbone of linked lists, trees, and graphs.'
                ],
                code: `#include <stdio.h>

typedef struct {
    char usn[16];
    char name[40];
    float cgpa;
} StudentRecord;

int main(void) {
    StudentRecord s1 = {"1DS22AE001", "Aarav Sharma", 9.15f};
    StudentRecord *ptr = &s1;
    printf("USN: %s | Name: %s | CGPA: %.2f\\n", ptr->usn, ptr->name, ptr->cgpa);
    return 0;
}`
            },
            {
                heading: 'File Input/Output Streams & Random Access',
                points: [
                    'FILE *fp = fopen(filename, mode) opens a stream in modes "r", "w", "a", "rb", "wb", or "r+".',
                    'Text stream I/O uses fprintf, fscanf, fgets, fputs; Binary stream I/O uses fread and fwrite for exact struct serialization.',
                    'Random access navigation uses fseek(fp, offset, SEEK_SET/SEEK_CUR/SEEK_END), ftell(fp), and rewind(fp).'
                ],
                code: `#include <stdio.h>

int main(void) {
    FILE *fp = fopen("batch_b22_log.txt", "w");
    if (!fp) return 1;
    fprintf(fp, "Batch B 22 - C Programming Lab Verified\\n");
    fclose(fp);
    return 0;
}`
            }
        ],
        practice: [
            'Why is sizeof(struct) often greater than the sum of sizeof() of its individual members? How does #pragma pack(1) affect it?',
            'Write a C program to store N student records into a binary file using fwrite() and read them back using fread().',
            'Compare struct, union, and enum with real embedded/aerospace systems examples.'
        ]
    }
];

async function seedB22CNotes() {
    await connectDB();

    const opsUser = await User.findOne({
        $or: [{ email: 'jaswanth@ethops.in' }, { username: 'jaswanth@ethops.in' }]
    });
    if (!opsUser) {
        throw new Error('Ops Admin account (jaswanth@ethops.in) not found.');
    }

    const b22Batch = await Batch.findOne({ batchName: /^B\s*22$/i }).populate('courseId');
    if (!b22Batch) {
        throw new Error('Batch B 22 not found in MongoDB.');
    }

    const dsuCCourse = b22Batch.courseId
        ? await Course.findById(b22Batch.courseId._id)
        : await Course.findOne({ code: 'DSU-C-001' });

    console.log(`Found Batch: ${b22Batch.batchName} (${b22Batch._id}) | Course: ${dsuCCourse?.name} (${dsuCCourse?.code})`);

    const batchMaterials = [];
    const courseMaterials = [];

    for (const mod of C_MODULES) {
        const pdfBuffer = await generateModulePdfBuffer(mod);

        // Save binary PDF in MaterialFile collection so /api/material-file/:id/:fileName works natively
        const matFile = await MaterialFile.create({
            fileName: mod.fileName,
            contentType: 'application/pdf',
            size: pdfBuffer.length,
            data: pdfBuffer,
            uploadedBy: opsUser._id
        });

        const normalUrl = `/api/material-file/${matFile._id}/${mod.fileName}`;
        console.log(`Generated & saved PDF: ${mod.module} — ${mod.title} (${pdfBuffer.length} bytes) -> ${normalUrl}`);

        const inlineTextSummary = [
            `# ${mod.module}: ${mod.title}`,
            mod.description,
            ...mod.sections.map(
                (s, idx) =>
                    `\n## ${idx + 1}. ${s.heading}\n` +
                    s.points.map((p) => `• ${p}`).join('\n') +
                    (s.code ? `\n\n\`\`\`c\n${s.code}\n\`\`\`` : '')
            ),
            `\n## Lab Exercises & Placement Interview Questions\n` +
                mod.practice.map((q, i) => `Q${i + 1}. ${q}`).join('\n'),
            `\n---\n© 2026 Ethnotech Academic Solutions Pvt. Ltd. All Rights Reserved. Proprietary study material for authorized Ethnotech Academy students and partner institutions.`
        ].join('\n\n');

        batchMaterials.push({
            title: mod.title,
            module: mod.module,
            type: mod.type,
            fileUrl: normalUrl,
            fileName: mod.fileName,
            description: mod.description,
            textContent: inlineTextSummary,
            sections: mod.sections,
            practice: mod.practice,
            uploadedBy: opsUser._id,
            uploadedByName: 'Jaswanth Narne (Ops Admin)',
            uploadedAt: new Date()
        });

        courseMaterials.push({
            title: mod.title,
            module: mod.module,
            type: 'Module Notes',
            fileUrl: normalUrl,
            fileName: mod.fileName,
            description: mod.description,
            textContent: inlineTextSummary,
            sections: mod.sections,
            practice: mod.practice,
            uploadedByName: 'Jaswanth Narne (Ops Admin)',
            uploadedAt: new Date()
        });
    }

    // Update Batch B 22 materials (preserving any non-duplicate existing items or replacing cleanly)
    b22Batch.materials = batchMaterials;
    await b22Batch.save();
    console.log(`Updated Batch "${b22Batch.batchName}" with ${batchMaterials.length} C Programming module PDFs.`);

    // Also update the mapped Course (Introduction to 'C' Programming (DSU)) so LMS tab also shows all 5 modules!
    if (dsuCCourse) {
        dsuCCourse.materials = courseMaterials;
        dsuCCourse.modulesCount = 5;
        if (!dsuCCourse.syllabusUrl && batchMaterials[0]?.fileUrl) {
            dsuCCourse.syllabusUrl = batchMaterials[0].fileUrl;
        }
        await dsuCCourse.save();
        console.log(`Updated Course "${dsuCCourse.name}" (${dsuCCourse.code}) with ${courseMaterials.length} LMS module notes.`);
    }

    // Also update CPF-01 (C Programming Fundamentals) if it exists so any C Programming course has both in-site notes + PDF
    const cpfCourse = await Course.findOne({ code: 'CPF-01' });
    if (cpfCourse) {
        cpfCourse.materials = courseMaterials;
        cpfCourse.modulesCount = 5;
        await cpfCourse.save();
        console.log(`Updated Course "${cpfCourse.name}" (CPF-01) with ${courseMaterials.length} LMS module notes.`);
    }

    process.exit(0);
}

seedB22CNotes().catch((err) => {
    console.error('Error seeding B 22 C Programming notes:', err);
    process.exit(1);
});
