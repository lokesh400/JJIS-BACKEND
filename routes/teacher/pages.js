const express = require('express');

const router = express.Router();

router.get('/teacher/question-bank', (req, res) =>
  res.render('teacher/question-bank', { title: 'Edit Question' })
);

module.exports = router;
