const express = require('express');
const Question = require('../models/Question');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const User = require('../models/User');
const { uploadToRandomCloud, deleteFromCloud } = require('../config/cloudinary');
const upload = require('../middleware/upload');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

async function resolveCurrentUser(req) {
  if (req.user && req.user._id) return req.user;
  const sessionUserId = req.session?.passport?.user;
  if (!sessionUserId) return null;
  return User.findById(sessionUserId).lean();
}

async function teacherOnly(req, res, next) {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) {
    return res.status(403).json({ message: 'Teacher/Admin access only.' });
  }
  req.currentUser = currentUser;
  return next();
}

async function getTeacherSubjectId(req) {
  if (req.currentUser?.role === 'admin') return null;
  const firstSubject = Array.isArray(req.currentUser?.subjects) ? req.currentUser.subjects[0] : null;
  return firstSubject ? String(firstSubject) : null;
}

router.get('/teacher/chapters', auth, teacherOnly, async (req, res) => {
  try {
    const subjectId = await getTeacherSubjectId(req);
    const filter = subjectId ? { subject: subjectId } : {};
    const chapters = await Chapter.find(filter).sort({ name: 1 }).lean();
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/topics/:chapterId', auth, teacherOnly, async (req, res) => {
  try {
    const subjectId = await getTeacherSubjectId(req);
    const chapterFilter = subjectId
      ? { _id: req.params.chapterId, subject: subjectId }
      : { _id: req.params.chapterId };
    const chapter = await Chapter.findOne(chapterFilter).lean();
    if (!chapter) return res.json([]);
    const topics = await Topic.find({ chapter: req.params.chapterId }).sort({ name: 1 }).lean();
    res.json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher', auth, teacherOnly, async (req, res) => {
  try {
    const subjectId = await getTeacherSubjectId(req);
    const { chapter, topic } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const filter = subjectId ? { subject: subjectId } : {};
    if (chapter) filter.chapter = chapter;
    if (topic) filter.topic = topic;

    const total = await Question.countDocuments(filter);
    const questions = await Question.find(filter)
      .populate('subject', 'name')
      .populate('chapter', 'name subject')
      .populate('topic', 'name chapter')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      items: questions,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/:id/topic', auth, teacherOnly, async (req, res) => {
  try {
    const subjectId = await getTeacherSubjectId(req);
    const { topic } = req.body || {};
    if (!topic) {
      return res.status(400).json({ message: 'Topic is required.' });
    }

    const questionFilter = subjectId
      ? { _id: req.params.id, subject: subjectId }
      : { _id: req.params.id };
    const question = await Question.findOne(questionFilter);
    if (!question) return res.status(404).json({ message: 'Question not found.' });

    const newTopic = await Topic.findById(topic).populate('chapter');
    if (!newTopic || !newTopic.chapter) {
      return res.status(400).json({ message: 'Selected topic is invalid.' });
    }
    if (subjectId && String(newTopic.chapter.subject) !== subjectId) {
      return res.status(400).json({ message: 'Selected topic is invalid for your subject.' });
    }

    question.topic = newTopic._id;
    question.chapter = newTopic.chapter._id;
    await question.save();

    const updated = await Question.findById(question._id)
      .populate('subject', 'name')
      .populate('chapter', 'name subject')
      .populate('topic', 'name chapter');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/teacher/:id/difficulty', auth, teacherOnly, async (req, res) => {
  try {
    const subjectId = await getTeacherSubjectId(req);
    const { difficulty } = req.body || {};
    const allowed = new Set(['unassigned', 'easy', 'medium', 'hard']);

    if (!allowed.has(difficulty)) {
      return res.status(400).json({ message: 'Difficulty must be one of unassigned, easy, medium, hard.' });
    }

    const questionFilter = subjectId
      ? { _id: req.params.id, subject: subjectId }
      : { _id: req.params.id };
    const question = await Question.findOne(questionFilter);
    if (!question) return res.status(404).json({ message: 'Question not found.' });

    question.difficulty = difficulty;
    await question.save();

    const updated = await Question.findById(question._id)
      .populate('subject', 'name')
      .populate('chapter', 'name subject')
      .populate('topic', 'name chapter');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get total count of questions matching filters
router.get('/count', auth, async (req, res) => {
  try {
    const { subject, chapter, topic } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (chapter) filter.chapter = chapter;
    if (topic) filter.topic = topic;
    const count = await Question.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get questions with filters
router.get('/', auth, async (req, res) => {
  try {
    const { subject, chapter, topic, type } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (chapter) filter.chapter = chapter;
    if (topic) filter.topic = topic;
    if (type) filter.type = type;

    const questions = await Question.find(filter)
      .populate('subject', 'name')
      .populate({
        path: 'chapter',
        select: 'name',
      })
      .populate('topic', 'name')
      .sort({ createdAt: -1 });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single question
router.get('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('subject', 'name')
      .populate('chapter', 'name')
      .populate('topic', 'name');

    if (!question) return res.status(404).json({ message: 'Question not found' });
    res.json(question);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', auth, upload.single('image'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
    return res.status(403).json({ message: 'Access denied.' });
  }

  const { type, correctOption, correctNumericalAnswer, correctOptions, subject, chapter, topic } = req.body;

  if (req.user.role === 'coordinator') {
    const isDesignated = (req.user.subjects || []).some(id => String(id) === String(subject));
    if (!isDesignated) {
      return res.status(403).json({ message: 'Access denied. You can only upload questions to your designated subjects.' });
    }
  }

  let uploadResult  = null;
  let cloudPrefix   = null;

  try {

    if (!req.file) {
      return res.status(400).json({ message: 'Question image is required' });
    }

    // Upload image to a randomly selected Cloudinary account
    const { result, cloudPrefix: picked } = await uploadToRandomCloud(req.file.buffer);
    uploadResult = result;
    cloudPrefix  = picked;

    const questionData = {
      imageUrl:      uploadResult.secure_url,
      imagePublicId: uploadResult.public_id,
      cloudPrefix,    // store so we know which account to delete from later
      type,
      subject,
      chapter,
      topic,
    };

    if (type === 'mcq') {
      questionData.correctOption = correctOption;
    } else if (type === 'numerical') {
      questionData.correctNumericalAnswer = parseFloat(correctNumericalAnswer);
    } else if (type === 'msq') {
      // correctOptions can come as array or comma-separated string
      let opts = correctOptions;
      if (typeof opts === 'string') opts = opts.split(',').map(o => o.trim().toUpperCase());
      questionData.correctOptions = opts || [];
    }

    const question = new Question(questionData);
    await question.save();

    const populated = await question.populate([
      { path: 'subject', select: 'name' },
      { path: 'chapter', select: 'name' },
      { path: 'topic', select: 'name' },
    ]);

    res.status(201).json(populated);
  } catch (error) {
    // Clean up uploaded image if DB save fails
    if (uploadResult && uploadResult.public_id && cloudPrefix) {
      try {
        await deleteFromCloud(uploadResult.public_id, cloudPrefix);
      } catch (cleanupErr) {
        console.error('Cloudinary cleanup failed:', cleanupErr.message);
      }
    }
    res.status(500).json({ message: error.message });
  }
});

// Delete question (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id).populate('subject', 'name');
    if (!question) return res.status(404).json({ message: 'Question not found' });

    // Delete from the correct Cloudinary account
    if (question.imagePublicId) {
      const target = question.cloudPrefix || question.subject?.name;
      if (target) await deleteFromCloud(question.imagePublicId, target);
    }

    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
