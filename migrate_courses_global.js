/**
 * Migration Script: Move from college-tied courses to global courses + mapping tables
 * 
 * What this does:
 * 1. For every Course that has a collegeId, create a CollegeCourseMap record
 * 2. For every Batch that has a trainerId + courseId + collegeId, create a TrainerCourseMap record
 * 3. Optionally nullify Course.collegeId (commented out — run manually when ready)
 * 
 * Run: node migrate_courses_global.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./models/Course');
const Batch = require('./models/Batch');
const CollegeCourseMap = require('./models/CollegeCourseMap');
const TrainerCourseMap = require('./models/TrainerCourseMap');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Step 1: Migrate Course → CollegeCourseMap
        console.log('\n--- Step 1: Migrating Courses to CollegeCourseMap ---');
        const courses = await Course.find({ collegeId: { $ne: null, $exists: true } });
        console.log(`Found ${courses.length} courses with collegeId`);

        let courseMapCount = 0;
        for (const course of courses) {
            const exists = await CollegeCourseMap.findOne({
                collegeId: course.collegeId,
                courseId: course._id
            });

            if (!exists) {
                await CollegeCourseMap.create({
                    collegeId: course.collegeId,
                    courseId: course._id,
                    customDuration: course.duration,
                    status: 'active'
                });
                courseMapCount++;
            }
        }
        console.log(`✅ Created ${courseMapCount} CollegeCourseMap records (${courses.length - courseMapCount} already existed)`);

        // Step 2: Migrate Batch trainer assignments → TrainerCourseMap
        console.log('\n--- Step 2: Migrating Batch trainer assignments to TrainerCourseMap ---');
        const batches = await Batch.find({
            trainerId: { $ne: null, $exists: true },
            courseId: { $ne: null, $exists: true },
            collegeId: { $ne: null, $exists: true }
        });
        console.log(`Found ${batches.length} batches with trainer assignments`);

        let trainerMapCount = 0;
        const seenCombos = new Set();
        for (const batch of batches) {
            const key = `${batch.trainerId}-${batch.collegeId}-${batch.courseId}`;
            if (seenCombos.has(key)) continue;
            seenCombos.add(key);

            const exists = await TrainerCourseMap.findOne({
                trainerId: batch.trainerId,
                collegeId: batch.collegeId,
                courseId: batch.courseId
            });

            if (!exists) {
                await TrainerCourseMap.create({
                    trainerId: batch.trainerId,
                    collegeId: batch.collegeId,
                    courseId: batch.courseId,
                    status: 'active'
                });
                trainerMapCount++;
            }
        }
        console.log(`✅ Created ${trainerMapCount} TrainerCourseMap records`);

        // Step 3 (OPTIONAL): Nullify Course.collegeId
        // Uncomment below when you're confident the migration is complete
        // console.log('\n--- Step 3: Nullifying Course.collegeId ---');
        // const result = await Course.updateMany(
        //     { collegeId: { $ne: null } },
        //     { $unset: { collegeId: '' } }
        // );
        // console.log(`✅ Cleared collegeId from ${result.modifiedCount} courses`);

        console.log('\n🎉 Migration complete!');
        console.log('Note: Course.collegeId has NOT been cleared yet. Uncomment Step 3 when ready.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

migrate();
