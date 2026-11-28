const jwt = require('jsonwebtoken');
const Blog = require('../models/Blog');
const User = require('../models/User');
const Student = require('../models/Student');
const College = require('../models/College');
const Batch = require('../models/Batch');
const TrainerCourseMap = require('../models/TrainerCourseMap');

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    ops_admin: 'Operations Admin',
    ast_ops_admin: 'Asst. Operations Admin',
    regional_manager: 'Regional Manager',
    asst_rm: 'Asst. Regional Manager',
    college_admin: 'College Admin',
    placement: 'Placement Officer',
    trainer: 'Trainer',
    student: 'Student'
};

const computeReadingTime = (html = '') => {
    const plain = String(html)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const words = plain ? plain.split(' ').length : 0;
    return Math.max(1, Math.ceil(words / 180));
};

/**
 * Middleware that authenticates either an Admin/Ops/Trainer (User) or a Student.
 */
const protectAnyActor = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Not authorized, no token' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 1. Check User collection first (Admin, Ops Admin, Trainer, etc.)
        const user = await User.findById(decoded.id).select('-password').lean();
        if (user) {
            if (user.activeSessionId && decoded.sessionId !== user.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email || 'Faculty';
            req.actor = {
                id: user._id,
                model: 'User',
                role: user.role,
                roleLabel: ROLE_LABELS[user.role] || 'Admin',
                name: fullName,
                employeeId: user.employeeId || '',
                collegeId: user.collegeId || null,
                assignedColleges: user.assignedColleges || [],
                assignedCourses: user.assignedCourses || []
            };
            return next();
        }

        // 2. Check Student collection
        const student = await Student.findById(decoded.id)
            .select('-password')
            .populate('batchId', 'batchName department')
            .populate('collegeId', 'name code')
            .lean();
        if (student) {
            if (student.activeSessionId && decoded.sessionId !== student.activeSessionId) {
                return res.status(401).json({
                    success: false,
                    code: 'SESSION_REPLACED',
                    error: 'Account logged in on another device. Only 1 active session is allowed.'
                });
            }
            const batchObj = student.batchId;
            const collegeObj = student.collegeId;
            req.actor = {
                id: student._id,
                model: 'Student',
                role: 'student',
                roleLabel: `Student • ${student.usn}`,
                name: student.name,
                usn: student.usn,
                department: student.department || batchObj?.department || '',
                batchId: batchObj?._id || student.batchId,
                batchName: batchObj?.batchName || 'Batch',
                collegeId: collegeObj?._id || student.collegeId,
                collegeName: collegeObj?.name || 'College',
                collegeCode: collegeObj?.code || ''
            };
            return next();
        }

        return res.status(401).json({ success: false, error: 'Account not found' });
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
};

/**
 * Resolves the colleges and batches a Trainer is assigned to.
 */
const resolveTrainerScope = async (actor) => {
    const mappings = await TrainerCourseMap.find({
        trainerId: actor.id,
        status: 'active'
    }).lean();

    const collegeIdSet = new Set();
    const courseIdSet = new Set();

    if (actor.collegeId) collegeIdSet.add(actor.collegeId.toString());
    (actor.assignedColleges || []).forEach((cid) => cid && collegeIdSet.add(cid.toString()));
    (actor.assignedCourses || []).forEach((crid) => crid && courseIdSet.add(crid.toString()));

    mappings.forEach((m) => {
        if (m.collegeId) collegeIdSet.add(m.collegeId.toString());
        if (m.courseId) courseIdSet.add(m.courseId.toString());
    });

    const batchQueryOr = [{ trainerId: actor.id }];
    if (collegeIdSet.size > 0 && courseIdSet.size > 0) {
        batchQueryOr.push({
            collegeId: { $in: Array.from(collegeIdSet) },
            courseId: { $in: Array.from(courseIdSet) }
        });
    } else if (collegeIdSet.size > 0) {
        batchQueryOr.push({ collegeId: { $in: Array.from(collegeIdSet) } });
    }

    const batches = await Batch.find({ $or: batchQueryOr })
        .populate('collegeId', 'name code')
        .populate('courseId', 'name code')
        .sort({ batchName: 1 })
        .lean();

    batches.forEach((b) => {
        const cid = b.collegeId?._id || b.collegeId;
        if (cid) collegeIdSet.add(cid.toString());
    });

    const colleges = await College.find({ _id: { $in: Array.from(collegeIdSet) } })
        .select('name code status')
        .sort({ name: 1 })
        .lean();

    return {
        colleges,
        batches,
        collegeIds: colleges.map((c) => c._id.toString()),
        batchIds: batches.map((b) => b._id.toString())
    };
};

/**
 * Seeds initial Medium-style editorial blog posts if none exist yet.
 */
let blogSeedPromise = null;
const ensureStarterBlogsSeeded = async () => {
    const count = await Blog.estimatedDocumentCount();
    if (count > 0) return;
    if (blogSeedPromise) return blogSeedPromise;

    blogSeedPromise = (async () => {
        const [opsUser, trainerUser, sampleBatch] = await Promise.all([
            User.findOne({ role: { $in: ['ops_admin', 'super_admin'] } }).lean(),
            User.findOne({ role: 'trainer' }).lean(),
            Batch.findOne({ batchName: /B\s*22/i })
                .populate('collegeId', 'name code')
                .lean() || Batch.findOne().populate('collegeId', 'name code').lean()
        ]);

        const fallbackBatch =
            sampleBatch || (await Batch.findOne().populate('collegeId', 'name code').lean());
        const sampleStudent = fallbackBatch
            ? await Student.findOne({ batchId: fallbackBatch._id }).lean()
            : await Student.findOne().lean();

        const starterPosts = [];

        if (opsUser) {
            const opsName =
                `${opsUser.firstName || ''} ${opsUser.lastName || ''}`.trim() || 'Jaswanth Narne';
            starterPosts.push({
                title: 'How to Approach Technical Coding Rounds & Campus Placements in 2026',
                subtitle:
                    'A practical roadmap from mastering core C and data structures to solving real company patterns in Code2Career.',
                category: 'Placement Prep',
                fontStyle: 'serif',
                tags: ['Placements', 'Code2Career', 'DSA', 'Career Strategy'],
                readingTimeMinutes: 4,
                authorId: opsUser._id,
                authorModel: 'User',
                authorName: opsName,
                authorRole: opsUser.role,
                authorRoleLabel: ROLE_LABELS[opsUser.role] || 'Operations Admin',
                authorHeadline: 'Operations & Academic Architecture • Ethnotech Academic Solutions',
                isGlobal: true,
                targetColleges: [],
                targetBatches: [],
                isPinned: true,
                status: 'published',
                claps: 42,
                content: `<h2>Why Structured Preparation Beats Random Grinding</h2>
<p>Every placement season, thousands of engineering students jump straight into hundreds of random coding problems without building mental models first. When the actual Online Assessment (OA) arrives, unfamiliar constraints cause panic.</p>
<blockquote>“Don’t memorize 500 solutions. Master 15 core patterns so deeply that you can adapt them under a 45-minute timer.”</blockquote>
<h3>1. Start With Memory &amp; Pointer Fundamentals</h3>
<p>Before diving into advanced graph theory, ensure your foundation in <strong>C programming</strong>—arrays, pointers, stack frames, and bitwise operators—is rock solid. Recruiters consistently test edge-case handling and space complexity in Round 1.</p>
<h3>2. Practice Company-Specific Tracks in Code2Career</h3>
<ul>
<li><strong>Service-Based Tracks:</strong> Focus on number theory, array equilibrium, string parsing, and modular arithmetic.</li>
<li><strong>Product-Based Leaders:</strong> Prioritize sliding windows, monotonic stacks, priority queues, and dynamic programming.</li>
<li><strong>FinTech &amp; Startups:</strong> Pay close attention to clean edge-case validation, rate-limiting logic, and greedy interval scheduling.</li>
</ul>
<pre><code>// Always verify boundary constraints before submitting:
// 1. Empty or single-element input
// 2. Integer overflow on large sums
// 3. O(N) or O(N log N) time complexity targets</code></pre>
<p>Use this <strong>Blogs</strong> space to share your learnings, read notes from your trainers, and discuss problem-solving strategies with your batchmates.</p>`
            });
        }

        if (trainerUser && fallbackBatch) {
            const trainerName =
                `${trainerUser.firstName || ''} ${trainerUser.lastName || ''}`.trim() || 'Jaswanth Narne';
            const collegeName = fallbackBatch.collegeId?.name || 'Dayanand Sagar University (DSU)';
            starterPosts.push({
                title: 'Mastering Pointers, Arrays & Memory Layout in C Without Losing Your Mind',
                subtitle:
                    'Understanding stack vs. heap allocation, pointer arithmetic, and why array decay happens during function calls.',
                category: 'Engineering & Code',
                fontStyle: 'serif',
                tags: ['C Programming', 'Pointers', 'Memory Management', fallbackBatch.batchName],
                readingTimeMinutes: 5,
                authorId: trainerUser._id,
                authorModel: 'User',
                authorName: trainerName,
                authorRole: 'trainer',
                authorRoleLabel: 'Trainer',
                authorHeadline: `Technical Trainer • ${collegeName}`,
                isGlobal: false,
                targetColleges: [fallbackBatch.collegeId?._id || fallbackBatch.collegeId],
                targetBatches: [fallbackBatch._id],
                isPinned: true,
                status: 'published',
                claps: 29,
                content: `<h2>The Mental Model Every C Programmer Needs</h2>
<p>When students first see <code>int *ptr = &amp;arr[0];</code>, the asterisk and ampersand can feel cryptic. Instead of thinking of pointers as magic symbols, picture memory as a long street of numbered houses where every byte has a unique numeric address.</p>
<blockquote>“A pointer is simply a variable that stores a street address instead of a house’s furniture.”</blockquote>
<h3>Key Takeaways From Our Batch Sessions</h3>
<ol>
<li><strong>Address-of Operator (<code>&amp;</code>):</strong> Returns the memory address where a variable lives.</li>
<li><strong>Dereference Operator (<code>*</code>):</strong> Visits that memory address and reads or modifies the value stored inside.</li>
<li><strong>Pointer Arithmetic:</strong> Adding <code>1</code> to an <code>int *</code> advances the address by <code>sizeof(int)</code> (4 bytes), not 1 byte!</li>
</ol>
<pre><code>#include &lt;stdio.h&gt;

void reverseArray(int *arr, int n) {
    int *left = arr;
    int *right = arr + n - 1;
    while (left &lt; right) {
        int temp = *left;
        *left = *right;
        *right = temp;
        left++;
        right--;
    }
}</code></pre>
<p>Review the 5 modules uploaded in your <strong>Study Material</strong> tab before our next assessment!</p>`
            });
        }

        if (sampleStudent && fallbackBatch) {
            starterPosts.push({
                title: 'How Our Batch Solved the First 5 Modules of C & Prepared for the Assessment',
                subtitle:
                    'Notes and reflections from our B 22 classroom sessions on control flow, recursion, and structures.',
                category: 'Study Guide',
                fontStyle: 'serif',
                tags: [fallbackBatch.batchName, 'Peer Notes', 'C Programming'],
                readingTimeMinutes: 3,
                authorId: sampleStudent._id,
                authorModel: 'Student',
                authorName: sampleStudent.name,
                authorRole: 'student',
                authorRoleLabel: `Student • ${sampleStudent.usn}`,
                authorHeadline: `${fallbackBatch.batchName} (${sampleStudent.department || fallbackBatch.department || 'CSE'}) • ${fallbackBatch.collegeId?.name || 'College'}`,
                isGlobal: false,
                targetColleges: [fallbackBatch.collegeId?._id || fallbackBatch.collegeId],
                targetBatches: [fallbackBatch._id],
                isPinned: false,
                status: 'published',
                claps: 18,
                content: `<h2>Quick Revision Checklist for Our Batch</h2>
<p>Here is a quick summary of the most common pitfalls we discussed in class this week while practicing C programs:</p>
<ul>
<li>Always check for off-by-one errors in <code>for</code> loop bounds (<code>i &lt; n</code> vs <code>i &lt;= n</code>).</li>
<li>Remember that strings in C require an extra byte for the null terminator <code>'\\0'</code>.</li>
<li>When using <code>scanf</code> with strings or characters after integers, watch out for the leftover newline in the input buffer.</li>
</ul>
<blockquote>“Writing dry-run trace tables on paper for 3 iterations catches 90% of logic bugs before you even hit compile.”</blockquote>
<p>Drop your favorite recursion or pointer tips in the comments below!</p>`
            });
        }

        if (starterPosts.length > 0) {
            await Blog.insertMany(starterPosts);
        }
    })()
        .catch((err) => console.error('[Blogs] Seeding failed:', err.message))
        .finally(() => {
            blogSeedPromise = null;
        });

    return blogSeedPromise;
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/blogs/context — Returns current actor's role & allowed target colleges/batches
   ═══════════════════════════════════════════════════════════════════════════ */
const getBlogAuthoringContext = async (req, res) => {
    try {
        await ensureStarterBlogsSeeded();
        const actor = req.actor;

        if (actor.role === 'student') {
            const batchDoc = await Batch.findById(actor.batchId)
                .populate('collegeId', 'name code')
                .populate('courseId', 'name code')
                .lean();
            return res.json({
                success: true,
                data: {
                    actor,
                    canSelectGlobal: false,
                    canSelectColleges: false,
                    canSelectBatches: false,
                    colleges: batchDoc?.collegeId ? [batchDoc.collegeId] : [],
                    batches: batchDoc ? [batchDoc] : []
                }
            });
        }

        if (actor.role === 'trainer') {
            const scope = await resolveTrainerScope(actor);
            return res.json({
                success: true,
                data: {
                    actor,
                    canSelectGlobal: false,
                    canSelectColleges: true,
                    canSelectBatches: true,
                    colleges: scope.colleges,
                    batches: scope.batches
                }
            });
        }

        // Admin / Ops Admin / College Admin / RM
        let collegeFilter = {};
        if (actor.role === 'college_admin' && actor.collegeId) {
            collegeFilter = { _id: actor.collegeId };
        } else if (['regional_manager', 'asst_rm'].includes(actor.role)) {
            const ids = [
                ...(actor.collegeId ? [actor.collegeId] : []),
                ...(actor.assignedColleges || [])
            ];
            collegeFilter = { _id: { $in: ids } };
        }

        const colleges = await College.find(collegeFilter).select('name code status').sort({ name: 1 }).lean();
        const collegeIds = colleges.map((c) => c._id);
        const batches = await Batch.find({ collegeId: { $in: collegeIds } })
            .populate('collegeId', 'name code')
            .populate('courseId', 'name code')
            .sort({ batchName: 1 })
            .lean();

        const isFullGlobalAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin'].includes(actor.role);

        return res.json({
            success: true,
            data: {
                actor,
                canSelectGlobal: isFullGlobalAdmin,
                canSelectColleges: true,
                canSelectBatches: true,
                colleges,
                batches
            }
        });
    } catch (err) {
        console.error('getBlogAuthoringContext error:', err);
        res.status(500).json({ success: false, error: 'Failed to load blog context' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/blogs — List blogs strictly scoped to the actor's role, college & batch
   ═══════════════════════════════════════════════════════════════════════════ */
const getBlogs = async (req, res) => {
    try {
        await ensureStarterBlogsSeeded();
        const actor = req.actor;
        const { collegeId, batchId, category, authorType, search } = req.query;

        const andConditions = [];

        // Published blogs OR drafts authored by the current actor
        andConditions.push({
            $or: [{ status: 'published' }, { authorId: actor.id }]
        });

        if (actor.role === 'student') {
            // Students ONLY see:
            // 1. Blogs targeted specifically to their own batch (including classmate student blogs & trainer/admin batch blogs)
            // 2. Blogs targeted to their college with empty targetBatches (from trainers/admins — student blogs always have targetBatches=[batchId])
            // 3. Global platform-wide blogs from Ops/Super Admin
            andConditions.push({
                $or: [
                    { authorId: actor.id },
                    { targetBatches: actor.batchId },
                    {
                        isGlobal: true,
                        authorRole: { $ne: 'student' }
                    },
                    {
                        targetColleges: actor.collegeId,
                        targetBatches: { $size: 0 },
                        authorRole: { $ne: 'student' }
                    }
                ]
            });
        } else if (actor.role === 'trainer') {
            const scope = await resolveTrainerScope(actor);
            andConditions.push({
                $or: [
                    { authorId: actor.id },
                    { isGlobal: true },
                    { targetBatches: { $in: scope.batchIds } },
                    {
                        targetColleges: { $in: scope.collegeIds },
                        targetBatches: { $size: 0 }
                    }
                ]
            });

            if (collegeId && collegeId !== 'all') {
                andConditions.push({
                    $or: [{ isGlobal: true }, { targetColleges: collegeId }]
                });
            }
            if (batchId && batchId !== 'all') {
                andConditions.push({
                    $or: [{ targetBatches: batchId }, { targetBatches: { $size: 0 } }]
                });
            }
        } else {
            // Admin / Ops Admin / College Admin
            const effectiveCollegeId =
                actor.role === 'college_admin' ? actor.collegeId : collegeId && collegeId !== 'all' ? collegeId : null;

            if (effectiveCollegeId) {
                andConditions.push({
                    $or: [{ isGlobal: true }, { targetColleges: effectiveCollegeId }]
                });
            }
            if (batchId && batchId !== 'all') {
                andConditions.push({
                    $or: [{ targetBatches: batchId }, { isGlobal: true }, { targetBatches: { $size: 0 } }]
                });
            }
        }

        if (category && category !== 'all') {
            andConditions.push({ category });
        }

        if (authorType === 'trainer') {
            andConditions.push({ authorRole: 'trainer' });
        } else if (authorType === 'student') {
            andConditions.push({ authorRole: 'student' });
        } else if (authorType === 'admin') {
            andConditions.push({
                authorRole: {
                    $in: ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin', 'regional_manager', 'asst_rm']
                }
            });
        } else if (authorType === 'mine') {
            andConditions.push({ authorId: actor.id });
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            andConditions.push({
                $or: [
                    { title: regex },
                    { subtitle: regex },
                    { authorName: regex },
                    { tags: regex },
                    { category: regex }
                ]
            });
        }

        const query = andConditions.length > 0 ? { $and: andConditions } : {};

        const blogs = await Blog.find(query)
            .populate('targetColleges', 'name code')
            .populate({
                path: 'targetBatches',
                select: 'batchName department collegeId',
                populate: { path: 'collegeId', select: 'name code' }
            })
            .sort({ isPinned: -1, createdAt: -1 })
            .lean();

        res.json({
            success: true,
            data: blogs
        });
    } catch (err) {
        console.error('getBlogs error:', err);
        res.status(500).json({ success: false, error: 'Failed to load blogs' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/blogs — Create a new Blog post with role-enforced audience scoping
   ═══════════════════════════════════════════════════════════════════════════ */
const createBlog = async (req, res) => {
    try {
        const actor = req.actor;
        const {
            title,
            subtitle,
            content,
            coverImage,
            images,
            category,
            fontStyle,
            tags,
            status,
            isPinned,
            isGlobal,
            targetColleges,
            targetBatches
        } = req.body;

        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, error: 'Blog title is required' });
        }
        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, error: 'Blog content is required' });
        }

        let resolvedIsGlobal = false;
        let resolvedColleges = [];
        let resolvedBatches = [];
        let authorHeadline = '';

        if (actor.role === 'student') {
            // Strictly scoped ONLY to the student's own batch and college
            resolvedIsGlobal = false;
            resolvedColleges = [actor.collegeId];
            resolvedBatches = [actor.batchId];
            authorHeadline = `${actor.batchName}${actor.department ? ` (${actor.department})` : ''} • ${actor.collegeName}`;
        } else if (actor.role === 'trainer') {
            // Trainer chooses from their assigned colleges & batches; trainer name is always displayed
            const scope = await resolveTrainerScope(actor);
            const requestedBatches = Array.isArray(targetBatches)
                ? targetBatches.filter((bid) => scope.batchIds.includes(String(bid)))
                : [];
            const requestedColleges = Array.isArray(targetColleges)
                ? targetColleges.filter((cid) => scope.collegeIds.includes(String(cid)))
                : [];

            if (requestedBatches.length > 0) {
                resolvedBatches = requestedBatches;
                const matchedBatchDocs = scope.batches.filter((b) =>
                    requestedBatches.includes(b._id.toString())
                );
                const derivedColleges = new Set(
                    matchedBatchDocs.map((b) => (b.collegeId?._id || b.collegeId)?.toString()).filter(Boolean)
                );
                resolvedColleges = Array.from(derivedColleges);
            } else if (requestedColleges.length > 0) {
                resolvedColleges = requestedColleges;
                // All trainer's assigned batches within those selected colleges
                resolvedBatches = scope.batches
                    .filter((b) =>
                        requestedColleges.includes((b.collegeId?._id || b.collegeId)?.toString())
                    )
                    .map((b) => b._id);
            } else {
                // Default to all batches assigned to this trainer
                resolvedColleges = scope.collegeIds;
                resolvedBatches = scope.batchIds;
            }

            if (resolvedColleges.length === 0 && resolvedBatches.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Please select at least one assigned college or batch to publish this blog.'
                });
            }

            const collegeNames = scope.colleges
                .filter((c) => resolvedColleges.map(String).includes(c._id.toString()))
                .map((c) => c.code || c.name)
                .slice(0, 2)
                .join(', ');
            authorHeadline = `Technical Trainer${collegeNames ? ` • ${collegeNames}` : ''}`;
        } else {
            // Admin / Ops Admin / College Admin
            const isFullGlobalAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin'].includes(actor.role);

            if (actor.role === 'college_admin' && actor.collegeId) {
                resolvedIsGlobal = false;
                resolvedColleges = [actor.collegeId];
                resolvedBatches = Array.isArray(targetBatches) ? targetBatches : [];
            } else if (Boolean(isGlobal) && isFullGlobalAdmin) {
                resolvedIsGlobal = true;
                resolvedColleges = [];
                resolvedBatches = [];
            } else {
                resolvedColleges = Array.isArray(targetColleges) ? targetColleges.filter(Boolean) : [];
                resolvedBatches = Array.isArray(targetBatches) ? targetBatches.filter(Boolean) : [];

                if (resolvedBatches.length > 0 && resolvedColleges.length === 0) {
                    const batchDocs = await Batch.find({ _id: { $in: resolvedBatches } })
                        .select('collegeId')
                        .lean();
                    resolvedColleges = Array.from(
                        new Set(batchDocs.map((b) => b.collegeId?.toString()).filter(Boolean))
                    );
                }

                if (resolvedColleges.length === 0 && resolvedBatches.length === 0) {
                    if (isFullGlobalAdmin) {
                        resolvedIsGlobal = true;
                    } else {
                        return res.status(400).json({
                            success: false,
                            error: 'Please select at least one college or batch.'
                        });
                    }
                }
            }

            authorHeadline = `${actor.roleLabel} • Ethnotech Academic Solutions`;
        }

        const parsedTags = Array.isArray(tags)
            ? tags.map((t) => String(t).trim()).filter(Boolean)
            : String(tags || '')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);

        const canPin = actor.role !== 'student';

        const normalizedImages = Array.isArray(images)
            ? images
                  .filter((img) => img && String(img.url || img).trim())
                  .map((img) =>
                      typeof img === 'string'
                          ? { url: img.trim(), caption: '' }
                          : { url: String(img.url).trim(), caption: String(img.caption || '').trim() }
                  )
            : [];

        const resolvedCover =
            String(coverImage || '').trim() || (normalizedImages.length > 0 ? normalizedImages[0].url : '');

        const blog = await Blog.create({
            title: String(title).trim(),
            subtitle: String(subtitle || '').trim(),
            content: String(content),
            coverImage: resolvedCover,
            images: normalizedImages,
            category: String(category || 'Engineering & Code').trim(),
            fontStyle: ['serif', 'sans', 'mono'].includes(fontStyle) ? fontStyle : 'serif',
            tags: parsedTags,
            readingTimeMinutes: computeReadingTime(content),
            authorId: actor.id,
            authorModel: actor.model,
            authorName: actor.name,
            authorRole: actor.role,
            authorRoleLabel: actor.roleLabel,
            authorHeadline,
            isGlobal: resolvedIsGlobal,
            targetColleges: resolvedColleges,
            targetBatches: resolvedBatches,
            status: status === 'draft' ? 'draft' : 'published',
            isPinned: canPin ? Boolean(isPinned) : false
        });

        const populated = await Blog.findById(blog._id)
            .populate('targetColleges', 'name code')
            .populate({
                path: 'targetBatches',
                select: 'batchName department collegeId',
                populate: { path: 'collegeId', select: 'name code' }
            })
            .lean();

        res.status(201).json({ success: true, data: populated });
    } catch (err) {
        console.error('createBlog error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to publish blog' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/blogs/:id — Update an existing Blog post
   ═══════════════════════════════════════════════════════════════════════════ */
const updateBlog = async (req, res) => {
    try {
        const actor = req.actor;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, error: 'Blog post not found' });

        const isOwner = blog.authorId.toString() === actor.id.toString();
        const isOverrideAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin'].includes(actor.role);

        if (!isOwner && !isOverrideAdmin) {
            return res.status(403).json({ success: false, error: 'Not authorized to edit this blog post' });
        }

        const {
            title,
            subtitle,
            content,
            coverImage,
            images,
            category,
            fontStyle,
            tags,
            status,
            isPinned,
            isGlobal,
            targetColleges,
            targetBatches
        } = req.body;

        if (title !== undefined) blog.title = String(title).trim();
        if (subtitle !== undefined) blog.subtitle = String(subtitle).trim();
        if (content !== undefined) {
            blog.content = String(content);
            blog.readingTimeMinutes = computeReadingTime(content);
        }
        if (images !== undefined) {
            blog.images = Array.isArray(images)
                ? images
                      .filter((img) => img && String(img.url || img).trim())
                      .map((img) =>
                          typeof img === 'string'
                              ? { url: img.trim(), caption: '' }
                              : { url: String(img.url).trim(), caption: String(img.caption || '').trim() }
                      )
                : [];
        }
        if (coverImage !== undefined) {
            blog.coverImage =
                String(coverImage).trim() || (blog.images?.length > 0 ? blog.images[0].url : '');
        }
        if (category !== undefined) blog.category = String(category).trim();
        if (fontStyle !== undefined && ['serif', 'sans', 'mono'].includes(fontStyle)) {
            blog.fontStyle = fontStyle;
        }
        if (tags !== undefined) {
            blog.tags = Array.isArray(tags)
                ? tags.map((t) => String(t).trim()).filter(Boolean)
                : String(tags || '')
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean);
        }
        if (status !== undefined) {
            blog.status = status === 'draft' ? 'draft' : 'published';
        }
        if (isPinned !== undefined && actor.role !== 'student') {
            blog.isPinned = Boolean(isPinned);
        }

        // Update audience targeting if author is not a student (student blogs remain locked to student's batch)
        if (blog.authorRole === 'student') {
            blog.isGlobal = false;
        } else if (actor.role === 'trainer') {
            const scope = await resolveTrainerScope(actor);
            if (targetBatches !== undefined || targetColleges !== undefined) {
                const requestedBatches = Array.isArray(targetBatches)
                    ? targetBatches.filter((bid) => scope.batchIds.includes(String(bid)))
                    : [];
                const requestedColleges = Array.isArray(targetColleges)
                    ? targetColleges.filter((cid) => scope.collegeIds.includes(String(cid)))
                    : [];

                if (requestedBatches.length > 0) {
                    blog.targetBatches = requestedBatches;
                    const matchedBatchDocs = scope.batches.filter((b) =>
                        requestedBatches.includes(b._id.toString())
                    );
                    blog.targetColleges = Array.from(
                        new Set(
                            matchedBatchDocs
                                .map((b) => (b.collegeId?._id || b.collegeId)?.toString())
                                .filter(Boolean)
                        )
                    );
                } else if (requestedColleges.length > 0) {
                    blog.targetColleges = requestedColleges;
                    blog.targetBatches = scope.batches
                        .filter((b) =>
                            requestedColleges.includes((b.collegeId?._id || b.collegeId)?.toString())
                        )
                        .map((b) => b._id);
                }
            }
        } else if (isOverrideAdmin && (isGlobal !== undefined || targetColleges !== undefined || targetBatches !== undefined)) {
            if (Boolean(isGlobal)) {
                blog.isGlobal = true;
                blog.targetColleges = [];
                blog.targetBatches = [];
            } else {
                blog.isGlobal = false;
                if (Array.isArray(targetColleges)) blog.targetColleges = targetColleges.filter(Boolean);
                if (Array.isArray(targetBatches)) blog.targetBatches = targetBatches.filter(Boolean);
            }
        }

        await blog.save();

        const populated = await Blog.findById(blog._id)
            .populate('targetColleges', 'name code')
            .populate({
                path: 'targetBatches',
                select: 'batchName department collegeId',
                populate: { path: 'collegeId', select: 'name code' }
            })
            .lean();

        res.json({ success: true, data: populated });
    } catch (err) {
        console.error('updateBlog error:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to update blog' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/blogs/:id — Delete a Blog post
   ═══════════════════════════════════════════════════════════════════════════ */
const deleteBlog = async (req, res) => {
    try {
        const actor = req.actor;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, error: 'Blog post not found' });

        const isOwner = blog.authorId.toString() === actor.id.toString();
        const isOverrideAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin'].includes(actor.role);

        if (!isOwner && !isOverrideAdmin) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this blog post' });
        }

        await blog.deleteOne();
        res.json({ success: true, message: 'Blog deleted successfully' });
    } catch (err) {
        console.error('deleteBlog error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete blog' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/blogs/:id/clap — Strictly 1 Like per User (Toggle Like / Unlike)
   ═══════════════════════════════════════════════════════════════════════════ */
const clapBlog = async (req, res) => {
    try {
        const actorKey = `${req.actor.model}:${req.actor.id}`;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, error: 'Blog post not found' });

        if (!Array.isArray(blog.clappedBy)) {
            blog.clappedBy = [];
        }

        const alreadyLiked = blog.clappedBy.includes(actorKey);
        if (alreadyLiked) {
            // Toggle off (unlike) so a user can never add more than 1 like
            blog.clappedBy = blog.clappedBy.filter((k) => k !== actorKey);
            blog.claps = Math.max(0, (blog.claps || 1) - 1);
        } else {
            // Add 1 like for this user
            blog.clappedBy.push(actorKey);
            blog.claps = (blog.claps || 0) + 1;
        }

        await blog.save();

        res.json({
            success: true,
            data: {
                claps: blog.claps,
                clappedBy: blog.clappedBy,
                liked: !alreadyLiked
            }
        });
    } catch (err) {
        console.error('clapBlog error:', err);
        res.status(500).json({ success: false, error: 'Failed to update like on blog' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/blogs/:id/comments — Add a Comment / Discussion response
   ═══════════════════════════════════════════════════════════════════════════ */
const addComment = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, error: 'Comment text is required' });
        }

        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, error: 'Blog post not found' });

        blog.comments.push({
            authorId: req.actor.id,
            authorName: req.actor.name,
            authorRole: req.actor.role,
            authorRoleLabel: req.actor.roleLabel,
            text: String(text).trim()
        });

        await blog.save();
        res.status(201).json({ success: true, data: blog.comments });
    } catch (err) {
        console.error('addComment error:', err);
        res.status(500).json({ success: false, error: 'Failed to post comment' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/blogs/:id/comments/:commentId — Delete a Comment
   ═══════════════════════════════════════════════════════════════════════════ */
const deleteComment = async (req, res) => {
    try {
        const actor = req.actor;
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, error: 'Blog post not found' });

        const comment = blog.comments.id(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const isCommentOwner = comment.authorId.toString() === actor.id.toString();
        const isBlogOwner = blog.authorId.toString() === actor.id.toString();
        const isOverrideAdmin = ['super_admin', 'ops_admin', 'ast_ops_admin', 'college_admin'].includes(actor.role);

        if (!isCommentOwner && !isBlogOwner && !isOverrideAdmin) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this comment' });
        }

        comment.deleteOne();
        await blog.save();
        res.json({ success: true, data: blog.comments });
    } catch (err) {
        console.error('deleteComment error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
};

module.exports = {
    protectAnyActor,
    getBlogAuthoringContext,
    getBlogs,
    createBlog,
    updateBlog,
    deleteBlog,
    clapBlog,
    addComment,
    deleteComment
};
