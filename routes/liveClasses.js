const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, adminOnly } = require('../middleware/auth');

// Models
const User = require('../models/User');
const Batch = require('../models/Batch');
const Class = require('../models/Class');
const Course = require('../models/Course');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Config for file uploads (notes/materials)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// YouTube Video ID Extraction Helper
function extractYoutubeId(input) {
  if (!input) return null;
  const regExp = /^[^#\&\?]*$/;
  if (input.length === 11 && regExp.test(input)) {
    return input;
  }
  const urlRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/)([^#\&\?]*).*/;
  const match = input.match(urlRegExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// ── Batch Endpoints ─────────────────────────────────────────────────────────

// Get all batches
router.get('/batches', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const allBatches = await Batch.find().sort({ name: 1 });
    if (!status) {
      return res.json(allBatches);
    }
    // Determine user's enrolled batch IDs
    const user = req.user;
    const enrolledIds = user.batches ? user.batches.map(b => b.toString()) : [];
    let filtered;
    if (status === 'available') {
      filtered = allBatches.filter(b => !enrolledIds.includes(b._id.toString()));
    } else if (status === 'purchased') {
      filtered = allBatches.filter(b => enrolledIds.includes(b._id.toString()));
    } else {
      filtered = allBatches;
    }
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single batch details
router.get('/batches/:batchId', auth, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create Batch
router.post('/batches', auth, adminOnly, async (req, res) => {
  const { name, description } = req.body;
  try {
    const newBatch = new Batch({ name, description });
    await newBatch.save();
    res.status(201).json(newBatch);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create batch. Name might already exist.' });
  }
});

// Delete Batch
router.delete('/batches/:batchId', auth, adminOnly, async (req, res) => {
  const { batchId } = req.params;
  try {
    // 1. Delete associated classes (and their notes)
    const classes = await Class.find({ batchId });
    for (const cls of classes) {
      if (cls.notesFile) {
        const filePath = path.join(uploadsDir, cls.notesFile);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      }
      await ChatMessage.deleteMany({ classId: cls._id });
    }
    await Class.deleteMany({ batchId });

    // 2. Remove this batch from all users' batches arrays
    await User.updateMany(
      { batches: batchId },
      { $pull: { batches: batchId } }
    );

    // 3. Delete the batch itself
    const batch = await Batch.findByIdAndDelete(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    res.json({ message: 'Batch deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Enroll Students (updates/overwrites the batch membership)
router.post('/batches/:batchId/enroll', auth, adminOnly, async (req, res) => {
  const { batchId } = req.params;
  const { studentIds } = req.body;
  try {
    // Remove this batchId from all students first
    await User.updateMany({ role: 'student' }, { $pull: { batches: batchId } });
    
    // Add batchId to selected students
    if (studentIds) {
      const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
      await User.updateMany({ _id: { $in: ids } }, { $addToSet: { batches: batchId } });
    }

    res.json({ message: 'Batch enrollment updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update batch enrollment.' });
  }
});

// Add specific students to a batch
router.post('/batches/:batchId/enroll-add', auth, adminOnly, async (req, res) => {
  const { batchId } = req.params;
  const { studentIds } = req.body;
  try {
    if (studentIds) {
      const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
      await User.updateMany({ _id: { $in: ids } }, { $addToSet: { batches: batchId } });
    }
    res.json({ message: 'Students enrolled successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to enroll students.' });
  }
});

// Unenroll a student
router.post('/batches/:batchId/unenroll', auth, adminOnly, async (req, res) => {
  const { batchId } = req.params;
  const { studentId } = req.body;
  try {
    await User.findByIdAndUpdate(studentId, { $pull: { batches: batchId } });
    res.json({ message: 'Student un-enrolled successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to cancel student subscription.' });
  }
});

// ── Class Endpoints ─────────────────────────────────────────────────────────

router.get('/classes', auth, async (req, res) => {
  try {
    const courses = req.user.role === 'student'
      ? await Course.find({ purchasedBy: req.user._id })
      : await Course.find();

    const classes = [];
    courses.forEach((course) => {
      let hasSubjects = false;
      if (Array.isArray(course.subjects) && course.subjects.length > 0) {
        course.subjects.forEach((subj) => {
          if (subj && Array.isArray(subj.chapters)) {
            subj.chapters.forEach((chap) => {
              if (chap && Array.isArray(chap.lectures)) {
                chap.lectures.forEach((lecture) => {
                  hasSubjects = true;
                  classes.push({
                    _id: lecture._id,
                    courseId: course._id,
                    title: lecture.title,
                    videoLink: lecture.videoLink,
                    status: lecture.status || 'ended',
                    scheduledAt: lecture.scheduledAt || new Date(),
                    subjectId: { name: subj.name },
                    chapterId: { name: chap.name },
                    description: course.description || ''
                  });
                });
              }
            });
          }
        });
      }

      if (!hasSubjects && Array.isArray(course.lectures)) {
        course.lectures.forEach((lecture) => {
          classes.push({
            _id: lecture._id,
            courseId: course._id,
            title: lecture.title,
            videoLink: lecture.videoLink,
            status: lecture.status || 'ended',
            scheduledAt: lecture.scheduledAt || new Date(),
            subjectId: { name: course.name },
            chapterId: { name: 'Video Session' },
            description: course.description || ''
          });
        });
      }
    });

    // Sort by scheduledAt descending
    classes.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create Class
router.post('/classes', auth, adminOnly, upload.single('notes'), async (req, res) => {
  const { title, description, youtubeId, scheduledDate, scheduledTime, batchId, subjectId, chapterId } = req.body;
  const parsedId = extractYoutubeId(youtubeId);

  if (!parsedId) {
    return res.status(400).json({ message: 'Invalid YouTube URL or Video ID.' });
  }

  if (!batchId || !subjectId || !chapterId) {
    return res.status(400).json({ message: 'Batch, Subject, and Chapter selection are required.' });
  }

  let finalScheduledAt = new Date();
  if (scheduledDate && scheduledTime) {
    finalScheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
  }
  
  if (isNaN(finalScheduledAt.getTime())) {
    finalScheduledAt = new Date();
  }

  try {
    const newClass = new Class({
      title,
      description,
      youtubeId: parsedId,
      scheduledAt: finalScheduledAt,
      batchId,
      subjectId,
      chapterId,
      notesFile: req.file ? req.file.filename : ''
    });

    await newClass.save();
    res.status(201).json(newClass);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create class. Please check inputs.' });
  }
});

// Update Class Status
router.post('/classes/:id/status/:status', auth, adminOnly, async (req, res) => {
  const { id, status } = req.params;
  if (!['scheduled', 'live', 'ended'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status update.' });
  }

  try {
    const cls = await Class.findByIdAndUpdate(id, { status }, { new: true });
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    res.json({ message: `Class status updated to ${status}!`, class: cls });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update class status.' });
  }
});

// Delete Class
router.delete('/classes/:id', auth, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const cls = await Class.findById(id);
    if (cls && cls.notesFile) {
      const filePath = path.join(uploadsDir, cls.notesFile);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
    await Class.findByIdAndDelete(id);
    await ChatMessage.deleteMany({ classId: id });
    res.json({ message: 'Class deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete class.' });
  }
});

// Secure Resource Download
router.get('/download/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const cls = await Class.findById(id);
    if (!cls || !cls.notesFile) {
      return res.status(404).json({ message: 'Resource file not found' });
    }

    // Role verification
    if (req.user.role === 'student') {
      const isEnrolled = req.user.batches.some(b => b.toString() === cls.batchId.toString());
      if (!isEnrolled) {
        return res.status(403).json({ message: 'Access denied. You are not enrolled in the batch for this resource.' });
      }
    } else if (!['admin', 'teacher', 'coordinator'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    const filePath = path.join(uploadsDir, cls.notesFile);
    if (fs.existsSync(filePath)) {
      res.download(filePath, cls.notesFile.substring(cls.notesFile.indexOf('-') + 1));
    } else {
      res.status(404).json({ message: 'File does not exist on the server' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
