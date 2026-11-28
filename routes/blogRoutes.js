const express = require('express');
const router = express.Router();
const {
    protectAnyActor,
    getBlogAuthoringContext,
    getBlogs,
    createBlog,
    updateBlog,
    deleteBlog,
    clapBlog,
    addComment,
    deleteComment
} = require('../controllers/blogController');

router.use(protectAnyActor);

router.get('/context', getBlogAuthoringContext);
router.get('/', getBlogs);
router.post('/', createBlog);
router.put('/:id', updateBlog);
router.delete('/:id', deleteBlog);
router.post('/:id/clap', clapBlog);
router.post('/:id/comments', addComment);
router.delete('/:id/comments/:commentId', deleteComment);

module.exports = router;
