const express = require('express');
const Class = require('../../models/Class');
const Course = require('../../models/Course');
const { auth } = require('../../middleware/auth');

const router = express.Router();

router.get('/student/dashboard', (req, res) => res.render('student/dashboard', { title: 'Dashboard' }));
router.get('/student/test-series', (req, res) => res.render('student/test-series-list', { title: 'Test Series' }));

// Batch-gated test route must be declared before the simpler testId route.
router.get('/student/test/:batchId/:testId', (req, res) => res.render('student/test-attempt', { title: 'Test' }));
router.get('/student/test/:testId', (req, res) => res.render('student/test-attempt', { title: 'Test' }));

router.get('/student/jee-test/:batchId/:testId', (req, res) =>
  res.render('student/jee-advanced-attempt', { title: 'JEE Advanced Test' })
);
router.get('/student/jee-test/:testId', (req, res) =>
  res.render('student/jee-advanced-attempt', { title: 'JEE Advanced Test' })
);

router.get('/student/test-series/:seriesId', (req, res) =>
  res.render('student/test-series-view', { title: 'Series Detail' })
);
router.get('/student/results/:testId', (req, res) => res.render('student/results', { title: 'Results' }));
router.get('/student/purchase-series', (req, res) =>
  res.render('student/purchase-series', { title: 'Purchase Series' })
);
router.get('/student/purchase-courses', (req, res) =>
  res.render('student/purchase-courses', { title: 'Purchase Courses' })
);
router.get('/student/course/:courseId', (req, res) =>
  res.render('student/course-view', { title: 'Course Detail' })
);
router.get('/student/course/:courseId/player', auth, (req, res) =>
  res.render('student/course-player', { title: 'Course Player', user: req.user })
);
router.get('/student/purchases', (req, res) => res.render('student/purchase-history', { title: 'My Purchases' }));
router.get('/student/study', (req, res) => res.render('student/study', { title: 'Study' }));
router.get('/student/battleground', (req, res) => res.render('student/battleground', { title: 'Battleground' }));
router.get('/student/battleground-prizes', (req, res) =>
  res.render('student/battleground-prizes', { title: 'Battleground Prizes' })
);
router.get('/student/profile', (req, res) => res.render('student/dashboard', { title: 'Profile' }));



router.get('/classroom/:classId', auth, async (req, res, next) => {
  try {
    const course = await Course.findOne({ 'lectures._id': req.params.classId });
    if (course) {
      return res.redirect(`/student/course/${course._id}/player?lectureId=${req.params.classId}`);
    }

    // Fallback search in old Class model if any exists
    const cls = await Class.findById(req.params.classId);
    if (!cls) {
      return res.status(404).send('Class or lecture session not found.');
    }

    // Fallback render if no Course found
    const token = Buffer.from(cls.youtubeId).toString('base64');
    res.render('student/classroom', {
      title: cls.title,
      cls,
      token,
      user: req.user
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
