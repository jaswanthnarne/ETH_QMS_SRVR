require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const https = require('https');

// Model Imports
const College = require('./models/College');
const Course = require('./models/Course');
const Exam = require('./models/Exam');
const TrainerExamKey = require('./models/TrainerExamKey');
const StudentAttempt = require('./models/StudentAttempt');
const User = require('./models/User');

const DEFAULT_TARGET = 'http://localhost:5000/api';
const targetUrl = process.argv[3] || DEFAULT_TARGET;
const concurrentUsers = parseInt(process.argv[2]) || 100;

async function runThrottlingTest() {
    console.log("=========================================================================");
    console.log("⚡ ETHNOTECH QMS - THROTTLING & CONCURRENCY SYSTEM TEST ⚡");
    console.log("=========================================================================");
    console.log(`Target API: ${targetUrl}`);
    console.log(`Simulated Candidates: ${concurrentUsers}`);
    
    // 1. Connect to DB
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URI not found in server .env file.");
        process.exit(1);
    }
    
    console.log("Connecting to Database to provision test session...");
    await mongoose.connect(dbUri);
    console.log("✅ Database connected successfully.");

    let tempCollege, tempCourse, tempTrainer, tempExam, tempKey;

    try {
        // 2. Provision Isolated Mock Exam Data
        console.log("\n📁 Provisioning test environment...");
        const salt = Date.now();
        
        tempCollege = await College.create({
            name: `Load Test College (${salt})`,
            code: `LTC-${salt.toString().slice(-4)}`
        });
        
        tempCourse = await Course.create({
            name: `Load Test Course (${salt})`,
            code: `LT-CRS-${salt.toString().slice(-4)}`,
            description: "Temporary course for stress testing",
            collegeId: tempCollege._id
        });

        tempTrainer = await User.create({
            username: `lt_trainer_${salt}`,
            password: `password_${salt}`,
            role: 'trainer',
            firstName: "LoadTest",
            lastName: "Trainer",
            phone: `LT-${salt.toString().slice(-6)}`
        });

        tempExam = await Exam.create({
            title: `Stress Test Assessment (${salt})`,
            description: "Calculated throttling simulator",
            duration: 60,
            totalMarks: 50,
            passingPercentage: 40,
            status: 'published',
            collegeId: tempCollege._id,
            courseId: tempCourse._id,
            createdBy: tempTrainer._id,
            scheduledDate: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day in the past to prevent clock drift issues
        });

        const testKey = `LTEST-${Math.floor(1000 + Math.random() * 9000)}`;
        tempKey = await TrainerExamKey.create({
            uniqueKey: testKey,
            isActive: true,
            isStarted: true,
            examId: tempExam._id,
            trainerId: tempTrainer._id
        });

        console.log(`✅ Provisioned Mock Session:`);
        console.log(`   - Exam Key:     [ ${testKey} ]`);
        console.log(`   - Exam ID:      ${tempExam._id}`);
        console.log(`   - Session ID:   ${tempKey._id}`);
        console.log(`   - Trainer ID:   ${tempTrainer._id}`);
        console.log(`   - College:      ${tempCollege.name}`);

        // 3. Perform Concurrency simulation
        console.log(`\n🚀 Commencing journey injection for ${concurrentUsers} mock students...`);
        console.log("Student Flow: [1. Validate Key] ➡️ [2. Start Attempt] ➡️ [3. Final Submit]");

        const stats = {
            validateSuccess: 0,
            validateFail: 0,
            startSuccess: 0,
            startFail: 0,
            submitSuccess: 0,
            submitFail: 0,
            rateLimited: 0,
            totalRequests: 0
        };

        const latencies = [];
        const startTime = Date.now();

        // Helper fetch wrapper to monitor performance and rate-limiting
        async function fetchJson(endpoint, body) {
            const startReq = Date.now();
            stats.totalRequests++;

            const payload = JSON.stringify(body);
            const urlObj = new URL(`${targetUrl}${endpoint}`);
            
            const client = urlObj.protocol === 'https:' ? https : http;
            
            return new Promise((resolve, reject) => {
                const req = client.request({
                    hostname: urlObj.hostname,
                    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        const duration = Date.now() - startReq;
                        latencies.push(duration);
                        
                        if (res.statusCode === 429) {
                            stats.rateLimited++;
                            resolve({ success: false, status: 429, error: 'Rate Limited' });
                        } else if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, status: res.statusCode });
                        } else {
                            resolve({ success: false, status: res.statusCode, error: data });
                        }
                    });
                });

                req.on('error', (e) => {
                    resolve({ success: false, status: 0, error: e.message });
                });

                req.write(payload);
                req.end();
            });
        }

        // Generate student request sequences
        const promises = Array.from({ length: concurrentUsers }).map(async (_, idx) => {
            const rollNumber = `LT-ROLL-${idx}-${salt.toString().slice(-4)}`;
            const studentDetails = {
                name: `Stress Student ${idx}`,
                rollNumber,
                mobile: `99999${idx.toString().padStart(5, '0')}`,
                department: "Automation"
            };

            // Stage 1: Validate Key
            const vRes = await fetchJson('/exam/validate-key', { key: testKey, rollNumber });
            if (vRes.success) {
                stats.validateSuccess++;
            } else {
                stats.validateFail++;
                if (stats.validateFail === 1) {
                    console.log(`DEBUG: Validate Fail Details: Status: ${vRes.status}, Error: ${vRes.error}`);
                }
                return; // halt flow if key validation fails
            }

            // Stage 2: Start Attempt
            const sRes = await fetchJson('/exam/start-attempt', {
                examId: tempExam._id,
                sessionId: tempKey._id,
                trainerId: tempTrainer._id,
                studentDetails
            });
            if (sRes.success) {
                stats.startSuccess++;
            } else {
                stats.startFail++;
                return; // halt flow if attempt initialization fails
            }

            // Stage 3: Submit Exam
            const subRes = await fetchJson('/exam/submit', {
                examId: tempExam._id,
                rollNumber,
                violations: { tabSwitches: 0 },
                isAutoSubmit: true
            });
            if (subRes.success) {
                stats.submitSuccess++;
            } else {
                stats.submitFail++;
            }
        });

        await Promise.all(promises);
        
        const totalDuration = (Date.now() - startTime) / 1000;
        
        // 4. Print detailed analytics
        console.log("\n=========================================================================");
        console.log("📊 THROTTLING & CONCURRENCY DIAGNOSTIC REPORT");
        console.log("=========================================================================");
        console.log(`- Elapsed Duration:      ${totalDuration.toFixed(2)} seconds`);
        console.log(`- Total Requests Fired:  ${stats.totalRequests}`);
        console.log(`- Total Rate Limited:    ${stats.rateLimited} requests (HTTP 429)`);
        console.log("\n📈 Stage Success Rates:");
        console.log(`  1. Validate Key:       ${stats.validateSuccess} Success / ${stats.validateFail} Failures`);
        console.log(`  2. Start Attempt:      ${stats.startSuccess} Success / ${stats.startFail} Failures`);
        console.log(`  3. Submit Attempt:     ${stats.submitSuccess} Success / ${stats.submitFail} Failures`);
        
        // Latency details
        const sum = latencies.reduce((a, b) => a + b, 0);
        const avg = sum / latencies.length || 0;
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const max = sorted[sorted.length - 1] || 0;

        console.log("\n⏱️ Response Latencies (HTTP Round-trip):");
        console.log(`  - Average Latency:     ${avg.toFixed(1)} ms`);
        console.log(`  - 95th Percentile:      ${p95} ms`);
        console.log(`  - Max Request Latency:  ${max} ms`);
        
        const overallTps = (stats.totalRequests / totalDuration).toFixed(1);
        console.log(`\n🚀 Overall System Throughput: ${overallTps} req/sec`);

        // Diagnose rate limits and concurrency recommendations
        console.log("\n📋 Architectural Recommendations:");
        if (stats.rateLimited > 0) {
            console.log("⚠️  RATE LIMIT TRIGGERED (HTTP 429):");
            console.log("   The server's express-rate-limiter blocked simulated concurrent requests from this IP.");
            console.log("   👉 In production exam environments (e.g. computer labs), all student computers share a single");
            console.log("      public NAT IP. A rate limit limit of 60 requests per minute will trigger blocks immediately.");
            console.log("   👉 Action: We recommend configuring 'trust proxy' in server index.js and whitelisting your campus");
            console.log("      public IP ranges or increasing the limit to allow concurrent student assessment loading.");
        } else {
            console.log("✅  RATE LIMIT STABLE:");
            console.log("   No API rate blocks triggered under this user count. If testing a larger cohort (e.g. 500+),");
            console.log("   make sure you adjust the request limits accordingly.");
        }

    } catch (err) {
        console.error("❌ Critical load test failure:", err);
    } finally {
        // 5. Clean up DB records to prevent pollution
        console.log("\n🧹 Cleaning up test database records...");
        try {
            if (tempExam) {
                await StudentAttempt.deleteMany({ examId: tempExam._id });
                await Exam.deleteOne({ _id: tempExam._id });
            }
            if (tempKey) {
                await TrainerExamKey.deleteOne({ _id: tempKey._id });
            }
            if (tempTrainer) {
                await User.deleteOne({ _id: tempTrainer._id });
            }
            if (tempCourse) {
                await Course.deleteOne({ _id: tempCourse._id });
            }
            if (tempCollege) {
                await College.deleteOne({ _id: tempCollege._id });
            }
            console.log("✅ Database records purged successfully.");
        } catch (cleanupErr) {
            console.error("⚠️ Failed to clean up database records:", cleanupErr.message);
        }
        
        await mongoose.disconnect();
        console.log("Disconnected from database.");
        console.log("=========================================================================\n");
    }
}

runThrottlingTest();
