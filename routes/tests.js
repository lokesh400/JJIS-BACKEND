const express = require('express');
const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const TestSeries = require('../models/TestSeries');
const Purchase = require('../models/Purchase');
const Question = require('../models/Question');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ==================== ADMIN ROUTES ====================

// Get all tests (admin)
router.get('/admin/all', auth, adminOnly, async (req, res) => {
  try {
    const tests = await Test.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(tests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create test (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, duration, sections, scheduledAt, mode, syllabus, testType } = req.body;
    const test = new Test({
      name,
      description,
      duration,
      sections: sections || [],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      mode: mode || 'real',
      syllabus: syllabus || '',
      testType: testType || 'standard',
      createdBy: req.user._id,
    });
    await test.save();
    res.status(201).json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download test questions as PDF (admin)
async function downloadPdfHandler(req, res) {
  try {
    const test = await Test.findById(req.params.id)
      .populate({
        path: 'sections.questions.question',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic', select: 'name' },
        ],
      })
      .lean();

    if (!test) return res.status(404).json({ message: 'Test not found' });

    const fileName = `${(test.name || 'test').replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gap = 14;
    const colW = (contentW - gap) / 2;
    const cardH = 240;
    const rowGap = 10;
    const topStartY = 74;

    const sanitize = (v) => (v === null || v === undefined ? '-' : String(v));
    const loadImageBuffer = async (url) => {
      if (!url) return null;
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000 });
        return Buffer.from(resp.data);
      } catch {
        return null;
      }
    };

    const drawHeader = () => {
      doc.fontSize(20).font('Helvetica-Bold').text(test.name || 'Test', margin, 36, { width: contentW, align: 'center' });
    };

    const drawSectionBar = (name) => {
      doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(12).text(`${name || 'Untitled Section'}`, margin, 58, {
        width: contentW,
        align: 'left',
      });
      doc.fillColor('#000000');
    };

    const drawQuestionCard = async (entry, index, x, y) => {
      const q = entry.question || {};
      const imageY = y;
      const imageH = 218;
      const img = await loadImageBuffer(q.imageUrl);
      if (img) {
        try {
          doc.image(img, x, imageY, { fit: [colW, imageH], align: 'center', valign: 'top' });
        } catch {
          doc.fontSize(9).fillColor('#6b7280').text('Image could not be rendered', x + 16, imageY + imageH / 2, { width: colW - 32, align: 'center' }).fillColor('#000000');
        }
      } else {
        doc.fontSize(9).fillColor('#6b7280').text('Image not available', x + 16, imageY + imageH / 2, { width: colW - 32, align: 'center' }).fillColor('#000000');
      }
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12).text(`Q${index}`, x + 4, imageY + 4);
    };

    let qNo = 1;

    for (let s = 0; s < (test.sections || []).length; s += 1) {
      const section = test.sections[s];
      if (s > 0) doc.addPage();
      drawHeader();
      drawSectionBar(section.name);

      let currentY = topStartY;
      for (let i = 0; i < (section.questions || []).length; i += 2) {
        if (currentY + cardH > pageH - 36) {
          doc.addPage();
          drawHeader();
          drawSectionBar(section.name);
          currentY = topStartY;
        }
        await drawQuestionCard(section.questions[i], qNo, margin, currentY);
        qNo += 1;
        if (section.questions[i + 1]) {
          await drawQuestionCard(section.questions[i + 1], qNo, margin + colW + gap, currentY);
          qNo += 1;
        }
        currentY += cardH + rowGap;
      }
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

router.get('/admin/:id/download-pdf', auth, adminOnly, downloadPdfHandler);
router.get('/:id/download-pdf', auth, adminOnly, downloadPdfHandler);

// Get single test (admin - full details)
router.get('/admin/:id', auth, adminOnly, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate({
        path: 'sections.questions.question',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic', select: 'name' },
        ],
      })
      .populate('createdBy', 'name');

    if (!test) return res.status(404).json({ message: 'Test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update test (admin)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, duration, isPublished, scheduledAt, mode, syllabus, testType } = req.body;
    const updateFields = { name, description, duration, isPublished };
    if (scheduledAt !== undefined) updateFields.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (mode !== undefined) updateFields.mode = mode;
    if (syllabus !== undefined) updateFields.syllabus = syllabus;
    if (testType !== undefined) updateFields.testType = testType;
    const test = await Test.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    );
    if (!test) return res.status(404).json({ message: 'Test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete test (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    // Also delete all attempts
    await TestAttempt.deleteMany({ test: req.params.id });
    res.json({ message: 'Test deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add section to test
router.post('/:id/sections', auth, adminOnly, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    test.sections.push({ name: req.body.name, questions: [] });
    await test.save();
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove section from test
router.delete('/:testId/sections/:sectionId', auth, adminOnly, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    test.sections = test.sections.filter(
      (s) => s._id.toString() !== req.params.sectionId
    );
    await test.save();
    res.json(test);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add question to section
router.post('/:testId/sections/:sectionId/questions', auth, adminOnly, async (req, res) => {
  try {
    const { questionId, positiveMarks, negativeMarks } = req.body;
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const section = test.sections.id(req.params.sectionId);
    if (!section) return res.status(404).json({ message: 'Section not found' });

    // Check if question already exists in this section
    const exists = section.questions.some(
      (q) => q.question.toString() === questionId
    );
    if (exists) {
      return res.status(400).json({ message: 'Question already in this section' });
    }

    section.questions.push({
      question: questionId,
      positiveMarks: positiveMarks || 4,
      negativeMarks: negativeMarks || 1,
    });
    await test.save();

    // Return populated test
    const populated = await Test.findById(test._id).populate({
      path: 'sections.questions.question',
      populate: [
        { path: 'subject', select: 'name' },
        { path: 'chapter', select: 'name' },
        { path: 'topic', select: 'name' },
      ],
    });
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove question from section
router.delete(
  '/:testId/sections/:sectionId/questions/:questionEntryId',
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const test = await Test.findById(req.params.testId);
      if (!test) return res.status(404).json({ message: 'Test not found' });

      const section = test.sections.id(req.params.sectionId);
      if (!section) return res.status(404).json({ message: 'Section not found' });

      section.questions = section.questions.filter(
        (q) => q._id.toString() !== req.params.questionEntryId
      );
      await test.save();

      const populated = await Test.findById(test._id).populate({
        path: 'sections.questions.question',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic', select: 'name' },
        ],
      });
      res.json(populated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get test results/attempts (admin)
router.get('/:id/results', auth, adminOnly, async (req, res) => {
  try {
    const attempts = await TestAttempt.find({ test: req.params.id, isSubmitted: true })
      .populate('user', 'name email')
      .populate('batch', 'name')
      .sort({ totalScore: -1 });
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single student's full attempt detail (admin)
router.get('/:id/results/:attemptId', auth, adminOnly, async (req, res) => {
  try {
    const attempt = await TestAttempt.findOne({
      _id: req.params.attemptId,
      test: req.params.id,
      isSubmitted: true,
    }).populate('batch', 'name').populate({
      path: 'answers.question',
      select: 'imageUrl type correctOption correctOptions correctNumericalAnswer subject chapter topic',
      populate: [
        { path: 'subject', select: 'name' },
        { path: 'chapter', select: 'name' },
        { path: 'topic',   select: 'name' },
      ],
    }).populate('user', 'name email');

    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    const test = await Test.findById(req.params.id)
      .select('name description duration sections')
      .populate({
        path: 'sections.questions.question',
        select: 'imageUrl type correctOption correctOptions correctNumericalAnswer subject chapter topic',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic',   select: 'name' },
        ],
      });

    res.json({ attempt, test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== STUDENT ROUTES ====================

// Get published tests (student)
router.get('/published', auth, async (req, res) => {
  try {
    const tests = await Test.find({ isPublished: true })
      .select('name description duration sections createdAt scheduledAt mode syllabus')
      .sort({ createdAt: -1 });

    // Add question count and check if already attempted
    const testsWithInfo = await Promise.all(
      tests.map(async (test) => {
        const attempt = await TestAttempt.findOne({
          user: req.user._id,
          test: test._id,
          isSubmitted: true,
        });
        const totalQuestions = test.sections.reduce(
          (acc, s) => acc + s.questions.length,
          0
        );
        return {
          _id: test._id,
          name: test.name,
          description: test.description,
          duration: test.duration,
          totalQuestions,
          sectionCount: test.sections.length,
          attempted: !!attempt,
          isSubmitted: attempt?.isSubmitted || false,
          scheduledAt: test.scheduledAt,
          mode: test.mode,
          testType: test.testType || 'standard',
          syllabus: test.syllabus,
          createdAt: test.createdAt,
        };
      })
    );

    res.json(testsWithInfo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Start test attempt (student)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate(
      'sections.questions.question'
    );
    if (!test) return res.status(404).json({ message: 'Test not found' });
    if (!test.isPublished) return res.status(400).json({ message: 'Test is not published' });

    // Check scheduled time — block if test hasn't started yet
    if (test.scheduledAt && new Date() < new Date(test.scheduledAt)) {
      return res.status(403).json({
        message: 'Test not yet available',
        scheduledAt: test.scheduledAt,
      });
    }

    // ── Batch-gated access check ─────────────────────────────────────
    const { batchId } = req.body;
    if (batchId) {
      const series = await TestSeries.findOne({ _id: batchId, isPublished: true });
      if (!series) return res.status(404).json({ message: 'Batch not found' });

      // Verify this test belongs to the batch
      const testInBatch = series.tests.some(t => t.toString() === test._id.toString());
      if (!testInBatch) {
        return res.status(403).json({ message: 'This test is not part of the specified batch' });
      }

      // Verify student has access (paid or batch is free)
      if (series.price > 0) {
        const hasPurchase = await Purchase.findOne({
          user: req.user._id,
          itemId: batchId,
          itemType: 'TestSeries',
          status: 'success',
        });
        const alsoInPurchasedBy = series.purchasedBy && series.purchasedBy.some(
          uid => uid.toString() === req.user._id.toString()
        );
        if (!hasPurchase && !alsoInPurchasedBy) {
          return res.status(403).json({ message: 'You do not have access to this batch' });
        }
      }
    }

    // Check existing attempt
    let attempt = await TestAttempt.findOne({
      user: req.user._id,
      test: test._id,
      isSubmitted: false,
    });

    // Find any submitted attempt
    const submittedAttempt = await TestAttempt.findOne({
      user: req.user._id,
      test: test._id,
      isSubmitted: true,
    });

    if (submittedAttempt) {
      if (test.mode === 'real') {
        // Real mode: one submission allowed — block
        return res.status(400).json({ message: 'You have already submitted this test' });
      }
      // Practice mode — delete any stale in-progress attempt so we always start clean
      if (attempt) {
        await TestAttempt.deleteOne({ _id: attempt._id });
        attempt = null;
      }
    }

    if (!attempt) {
      // Calculate max score
      let maxScore = 0;
      test.sections.forEach((section) => {
        section.questions.forEach((q) => {
          maxScore += (q.positiveMarks || 0);
        });
      });

      attempt = new TestAttempt({
        user: req.user._id,
        test: test._id,
        batch: batchId || null,
        answers: [],
        maxScore,
        startedAt: new Date(),
      });
      await attempt.save();
    }

    // Return test without correct answers
    const testData = {
      _id: test._id,
      name: test.name,
      description: test.description,
      duration: test.duration,
      mode: test.mode,
      testType: test.testType || 'standard',
      scheduledAt: test.scheduledAt,
      syllabus: test.syllabus,
      sections: test.sections.map((section) => ({
        _id: section._id,
        name: section.name,
        questions: section.questions.map((q) => ({
          _id: q._id,
          question: {
            _id: q.question._id,
            imageUrl: q.question.imageUrl,
            type: q.question.type,
          },
          positiveMarks: q.positiveMarks,
          negativeMarks: q.negativeMarks,
        })),
      })),
    };

    res.json({
      test: testData,
      attempt: {
        _id: attempt._id,
        startedAt: attempt.startedAt,
        answers: attempt.answers,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit test (student) — receives the complete answers + timeSpent payload in one shot.
// All answers and per-question time are held client-side until the student clicks Submit.
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { answers: clientAnswers = [] } = req.body;

    const attempt = await TestAttempt.findOne({
      user: req.user._id,
      test: req.params.id,
      isSubmitted: false,
    });
    if (!attempt) return res.status(400).json({ message: 'No active attempt found' });

    const test = await Test.findById(req.params.id).populate('sections.questions.question');

    // Grade and store all answers from the client payload in one pass
    attempt.answers = [];
    let totalScore = 0;
    const isJeeAdvanced = test.testType === 'jee-advanced';

    for (const ca of clientAnswers) {
      const { questionId, sectionId, selectedOption, selectedOptions, numericalAnswer, timeSpent } = ca;

      const section = test.sections.find(s => s._id.toString() === sectionId);
      if (!section) continue;
      const qEntry = section.questions.find(q => q.question._id.toString() === questionId);
      if (!qEntry) continue;

      const question = qEntry.question;
      let isCorrect = false;
      let marksObtained = 0;

      if (question.type === 'mcq' && selectedOption) {
        isCorrect = selectedOption === question.correctOption;
        marksObtained = isCorrect ? qEntry.positiveMarks : -qEntry.negativeMarks;
      } else if (question.type === 'numerical' && numericalAnswer !== null && numericalAnswer !== undefined) {
        isCorrect = Math.abs(numericalAnswer - question.correctNumericalAnswer) < 0.01;
        // JEE Advanced integer type: 0 marks for wrong answer (no negative)
        marksObtained = isCorrect ? qEntry.positiveMarks : (isJeeAdvanced ? 0 : -qEntry.negativeMarks);
      } else if (question.type === 'msq' && Array.isArray(selectedOptions) && selectedOptions.length > 0) {
        // JEE Advanced MSQ marking scheme:
        //  • Any wrong option selected (even alongside correct ones) → −negativeMarks only, no credit for right
        //  • No wrong option selected + ALL correct options selected → full positive marks
        //  • No wrong option selected + PARTIAL correct options selected → +1 per correctly-selected option
        //  • No attempt → 0
        const correctSet = new Set((question.correctOptions || []).map(o => o.toUpperCase()));
        const chosen     = selectedOptions.map(o => o.toUpperCase());
        const wrongSelected  = chosen.filter(o => !correctSet.has(o)).length;
        const rightSelected  = chosen.filter(o =>  correctSet.has(o)).length;

        if (wrongSelected > 0) {
          // Negative marks for any wrong selection
          marksObtained = -qEntry.negativeMarks;
          isCorrect = false;
        } else if (rightSelected === correctSet.size) {
          // All correct options selected, none wrong
          marksObtained = qEntry.positiveMarks;
          isCorrect = true;
        } else {
          // Partial credit — +1 per correctly-selected option (no wrong options)
          marksObtained = rightSelected;
          isCorrect = false;
        }
      } else {
        // No attempt
        marksObtained = 0;
        isCorrect = false;
      }

      totalScore += marksObtained;
      attempt.answers.push({
        question:        questionId,
        sectionId,
        selectedOption:  selectedOption  || null,
        selectedOptions: Array.isArray(selectedOptions) ? selectedOptions : [],
        numericalAnswer: numericalAnswer !== undefined ? numericalAnswer : null,
        isCorrect,
        marksObtained,
        timeSpent: typeof timeSpent === 'number' ? Math.round(timeSpent) : 0,
      });
    }

    attempt.totalScore  = totalScore;
    attempt.isSubmitted = true;
    attempt.submittedAt = new Date();
    await attempt.save();

    res.json({ totalScore: attempt.totalScore, maxScore: attempt.maxScore, answers: attempt.answers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get my result for a test
router.get('/:id/my-result', auth, async (req, res) => {
  try {
    const attempt = await TestAttempt.findOne({
      user: req.user._id,
      test: req.params.id,
      isSubmitted: true,
    })
    .sort({ submittedAt: -1 })  // always return the most recent attempt (important for practice mode retries)
    .populate({
      path: 'answers.question',
      select: 'imageUrl type correctOption correctOptions correctNumericalAnswer subject chapter topic',
      populate: [
        { path: 'subject', select: 'name' },
        { path: 'chapter', select: 'name' },
        { path: 'topic',   select: 'name' },
      ],
    });

    if (!attempt) {
      return res.status(404).json({ message: 'No submitted attempt found' });
    }

    const test = await Test.findById(req.params.id)
      .select('name description duration sections testType')
      .populate({
        path: 'sections.questions.question',
        select: 'imageUrl type correctOption correctOptions correctNumericalAnswer subject chapter topic',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic',   select: 'name' },
        ],
      });

    res.json({ attempt, test });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
