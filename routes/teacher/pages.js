const express = require('express');

const router = express.Router();

router.get('/teacher/question-bank', (req, res) =>
  res.render('teacher/question-bank', { title: 'Edit Question' })
);

router.get('/teacher/tests', (req, res) =>
  res.render('admin/test-list', { title: 'Tests' })
);

router.get('/teacher/tests/:testId', (req, res) =>
  res.render('admin/test-creator', { title: 'Test Creator' })
);

router.get('/coordinator/tests', (req, res) =>
  res.render('admin/test-list', { title: 'Tests' })
);

module.exports = router;
