const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');
const Course = require('./models/Course');

// Load env variables
dotenv.config({ path: path.join(__dirname, '.env') });

const dbUrl = process.env.MONGODB_URI;
if (!dbUrl) {
    console.error('MONGODB_URI is not defined in the .env file!');
    process.exit(1);
}

const trainersToSeed = [
    { username: 'tr_alex_smith', employeeId: 'EMP-TR-001', firstName: 'Alex', lastName: 'Smith', email: 'alex.smith@ethnotech.com', phone: '9876543001', program: 'EWDP' },
    { username: 'tr_priya_sharma', employeeId: 'EMP-TR-002', firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@ethnotech.com', phone: '9876543002', program: 'CFS' },
    { username: 'tr_rahul_kumar', employeeId: 'EMP-TR-003', firstName: 'Rahul', lastName: 'Kumar', email: 'rahul.kumar@ethnotech.com', phone: '9876543003', program: 'PMKVY' },
    { username: 'tr_sneha_patel', employeeId: 'EMP-TR-004', firstName: 'Sneha', lastName: 'Patel', email: 'sneha.patel@ethnotech.com', phone: '9876543004', program: 'CMKKY' },
    { username: 'tr_david_miller', employeeId: 'EMP-TR-005', firstName: 'David', lastName: 'Miller', email: 'david.miller@ethnotech.com', phone: '9876543005', program: 'EWDP' },
    { username: 'tr_meera_nair', employeeId: 'EMP-TR-006', firstName: 'Meera', lastName: 'Nair', email: 'meera.nair@ethnotech.com', phone: '9876543006', program: 'CFS' },
    { username: 'tr_vikram_singh', employeeId: 'EMP-TR-007', firstName: 'Vikram', lastName: 'Singh', email: 'vikram.singh@ethnotech.com', phone: '9876543007', program: 'PMKVY' },
    { username: 'tr_ananya_das', employeeId: 'EMP-TR-008', firstName: 'Ananya', lastName: 'Das', email: 'ananya.das@ethnotech.com', phone: '9876543008', program: 'CMKKY' },
    { username: 'tr_john_doe', employeeId: 'EMP-TR-009', firstName: 'John', lastName: 'Doe', email: 'john.doe@ethnotech.com', phone: '9876543009', program: 'EWDP' },
    { username: 'tr_kavitha_rao', employeeId: 'EMP-TR-010', firstName: 'Kavitha', lastName: 'Rao', email: 'kavitha.rao@ethnotech.com', phone: '9876543010', program: 'CFS' }
];

const coursesToSeed = [
    { name: 'Full Stack Web Development with React', code: 'FS-REACT-01', description: 'Comprehensive guide to building modern SPAs with React, Node, and MongoDB.', duration: '120 Hours', modulesCount: 6, program: 'EWDP' },
    { name: 'Data Science & Machine Learning', code: 'DS-ML-02', description: 'Python-based machine learning, data processing, visualization and statistical modeling.', duration: '90 Hours', modulesCount: 5, program: 'CFS' },
    { name: 'Advanced Java Programming', code: 'ADV-JAVA-03', description: 'Deep dive into J2EE framework, multi-threading, Spring Boot microservices, and databases.', duration: '80 Hours', modulesCount: 4, program: 'PMKVY' },
    { name: 'Cloud Computing & DevOps', code: 'CLOUD-DEVOPS-04', description: 'Hands-on training with AWS, Docker, Kubernetes, CI/CD pipelines, and infrastructure as code.', duration: '100 Hours', modulesCount: 7, program: 'CMKKY' },
    { name: 'Cybersecurity & Ethical Hacking', code: 'CYBER-SEC-05', description: 'Security fundamentals, penetration testing, networks defense, and ethical hacking techniques.', duration: '70 Hours', modulesCount: 5, program: 'EWDP' }
];

async function seed() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(dbUrl);
        console.log('Database connected successfully.');

        // Seed Trainers
        console.log('\n--- Seeding Trainers ---');
        let trainerCount = 0;
        for (const tr of trainersToSeed) {
            const existingTrainer = await User.findOne({ 
                $or: [{ username: tr.username }, { employeeId: tr.employeeId }] 
            });

            if (existingTrainer) {
                console.log(`Trainer already exists (username/employeeId matches): ${tr.username}`);
            } else {
                await User.create({
                    ...tr,
                    role: 'trainer',
                    password: 'password123', // Will be hashed by userSchema.pre('save')
                    isActive: true
                });
                console.log(`Created Trainer: ${tr.firstName} ${tr.lastName} (${tr.employeeId})`);
                trainerCount++;
            }
        }

        // Seed Courses
        console.log('\n--- Seeding Courses ---');
        let courseCount = 0;
        for (const cr of coursesToSeed) {
            const existingCourse = await Course.findOne({ code: cr.code });

            if (existingCourse) {
                console.log(`Course already exists (code matches): ${cr.code}`);
            } else {
                await Course.create({
                    ...cr,
                    status: 'active'
                });
                console.log(`Created Course: ${cr.name} (${cr.code})`);
                courseCount++;
            }
        }

        console.log(`\nSeeding completed: ${trainerCount} trainers and ${courseCount} courses seeded.`);
    } catch (error) {
        console.error('Error during seeding:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Database disconnected.');
    }
}

seed();
