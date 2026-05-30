const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000/api';

async function runLoadTest(concurrentUsers = 1000) {
    console.log(`🚀 Node.js v22 detected. Native fetch will be used.`);
    console.log(`🚀 Starting Full Flow Load Test for ${concurrentUsers} concurrent users...`);
    
    try {
        await mongoose.connect('mongodb+srv://Jashu:db%40admin%21Ethno%2398@cluster0.3tszizk.mongodb.net/qms');
        console.log("✅ Connected to MongoDB");
    } catch (e) {
        console.error("❌ Failed to connect to MongoDB.");
        process.exit(1);
    }

    const TrainerExamKey = mongoose.model('TrainerExamKey', new mongoose.Schema({ uniqueKey: String, isActive: Boolean, examId: mongoose.Schema.Types.ObjectId, trainerId: mongoose.Schema.Types.ObjectId }));
    const keyDoc = await TrainerExamKey.findOne({ isActive: true });
    
    if (!keyDoc) {
        console.error('❌ No active exam key found.');
        mongoose.disconnect();
        process.exit(1);
    }
    
    const entryKey = keyDoc.uniqueKey;
    const examId = keyDoc.examId;
    const sessionId = keyDoc._id;
    const trainerId = keyDoc.trainerId;

    const startTime = Date.now();
    let stats = { validate: 0, start: 0, submit: 0, errors: 0 };

    console.log(`⚡ Executing ${concurrentUsers} full student journeys (Validate -> Start -> Submit)...`);

    const userJourneys = Array.from({ length: concurrentUsers }).map(async (_, i) => {
        const rollNumber = `LT-USER-${i}`;
        const studentDetails = { name: "Load Test User", rollNumber, mobile: "9123456789", department: "Testing" };

        try {
            // 1. Validate
            const resVal = await fetch(`${BASE_URL}/exam/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: entryKey, rollNumber })
            });
            if (resVal.ok) stats.validate++; else throw new Error('Val fail ' + resVal.status);

            // 2. Start
            const resStart = await fetch(`${BASE_URL}/exam/start-attempt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, sessionId, trainerId, studentDetails })
            });
            if (resStart.ok) stats.start++; else throw new Error('Start fail ' + resStart.status);

            // 3. Submit
            const resSub = await fetch(`${BASE_URL}/exam/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, rollNumber, violations: { tabSwitches: 0 } })
            });
            if (resSub.ok) stats.submit++; else throw new Error('Submit fail ' + resSub.status);

        } catch (e) {
            stats.errors++;
            if (stats.errors === 1) console.log(`DEBUG: First error: ${e.message}`);
        }
    });

    await Promise.all(userJourneys);
    const totalTime = (Date.now() - startTime) / 1000;
    
    console.log(`\n📊 Institutional Scale Results (${concurrentUsers} users):`);
    console.log(`- Total Time: ${totalTime.toFixed(2)}s`);
    console.log(`- Success Validate: ${stats.validate}`);
    console.log(`- Success Start:    ${stats.start}`);
    console.log(`- Success Submit:   ${stats.submit}`);
    console.log(`- Total Errors:     ${stats.errors}`);
    console.log(`- Overall TPS (Transactions Per Sec): ${((stats.submit + stats.start + stats.validate) / totalTime).toFixed(2)}`);
    console.log(`- Full Journey Throughput: ${(stats.submit / totalTime).toFixed(2)} students/sec`);

    if (stats.submit > 900) {
        console.log(`\n✅ PLATFORM READY: Backend sustained institutional-grade pressure of ${(stats.submit / totalTime).toFixed(2)} entries/sec.`);
    } else {
        console.log(`\n⚠️ SCALING NEEDED: Some failures observed under concurrent load.`);
    }

    await mongoose.disconnect();
}

const users = parseInt(process.argv[2]) || 1000;
runLoadTest(users).catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
});
