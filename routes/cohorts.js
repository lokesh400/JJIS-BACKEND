const express = require('express');
const { auth } = require('../middleware/auth');
const Batch = require('../models/Batch');
const Class = require('../models/Class');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/cohorts
 * Returns the list of batches the authenticated student is enrolled in.
 * Admins/teachers see all batches.
 */
router.get('/', auth, async (req, res) => {
  try {
    let batches;

    if (req.user.role === 'student') {
      // Populate enrolled batches from User.batches array
      const user = await User.findById(req.user._id)
        .populate('batches', '_id name description createdAt')
        .lean();

      batches = user?.batches || [];
    } else {
      // Admin / teacher sees everything
      batches = await Batch.find().sort({ name: 1 }).lean();
    }

    res.json({ data: batches });
  } catch (err) {
    console.error('[cohorts] GET / error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/cohorts/:cohortId/schedule
 * Returns live / upcoming / completed classes for a given batch.
 * Students must be enrolled in the batch; admins bypass the check.
 */
router.get('/:cohortId/schedule', auth, async (req, res) => {
  try {
    const { cohortId } = req.params;

    // Verify batch exists
    const batch = await Batch.findById(cohortId).lean();
    if (!batch) {
      return res.status(404).json({ message: 'Cohort not found' });
    }

    // Students must be enrolled
    if (req.user.role === 'student') {
      const enrolled = (req.user.batches || []).some(
        (b) => b.toString() === cohortId
      );
      if (!enrolled) {
        return res.status(403).json({ message: 'You are not enrolled in this cohort' });
      }
    }

    // Fetch all classes for this batch, populate subject & chapter names
    const classes = await Class.find({ batchId: cohortId })
      .populate('subjectId', 'name')
      .populate('chapterId', 'name')
      .sort({ scheduledAt: -1 })
      .lean();

    const now = new Date();

    // Bucket into live / upcoming / completed based on status field
    const live = [];
    const upcoming = [];
    const completed = [];

    classes.forEach((cls) => {
      const mapped = {
        _id: cls._id,
        title: cls.title,
        subject: cls.subjectId?.name || '',
        chapter: cls.chapterId?.name || '',
        youtubeId: cls.youtubeId,
        scheduledAt: cls.scheduledAt,
        status: cls.status,
        notesFile: cls.notesFile || '',
        description: cls.description || '',
      };

      if (cls.status === 'live') {
        live.push(mapped);
      } else if (cls.status === 'scheduled') {
        upcoming.push(mapped);
      } else {
        completed.push(mapped);
      }
    });

    // Sort upcoming chronologically (soonest first)
    upcoming.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    res.json({ live, upcoming, completed });
  } catch (err) {
    console.error('[cohorts] GET /:cohortId/schedule error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
