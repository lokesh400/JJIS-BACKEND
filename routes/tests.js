const express = require('express');
const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const TestSeries = require('../models/TestSeries');
const Purchase = require('../models/Purchase');
const Question = require('../models/Question');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const { auth, adminOnly } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

async function adminOrCoordinator(req, res, next) {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser || !['admin', 'coordinator'].includes(currentUser.role)) {
    return res.status(403).json({ message: 'Admin/Coordinator access only.' });
  }
  req.currentUser = currentUser;
  next();
}

async function resolveCurrentUser(req) {
  if (req.user && req.user._id) return req.user;
  const sessionUserId = req.session?.passport?.user;
  if (!sessionUserId) return null;
  return User.findById(sessionUserId).lean();
}

async function testManagerOnly(req, res, next) {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser || !['admin', 'teacher', 'coordinator'].includes(currentUser.role)) {
    return res.status(403).json({ message: 'Admin/Teacher/Coordinator access only.' });
  }
  req.currentUser = currentUser;
  next();
}

function getTeacherSubjectId(currentUser) {
  if (!currentUser || currentUser.role === 'admin') return null;
  const firstSubject = Array.isArray(currentUser.subjects) ? currentUser.subjects[0] : null;
  if (!firstSubject) return null;
  if (typeof firstSubject === 'object' && firstSubject._id) return String(firstSubject._id);
  return String(firstSubject);
}

function filterTestBySubjectForTeacher(testDoc, subjectId) {
  if (!subjectId || !testDoc?.sections) return testDoc;
  const data = testDoc.toObject ? testDoc.toObject() : testDoc;
  data.sections = (data.sections || []).map((section) => ({
    ...section,
    questions: (section.questions || []).filter((entry) => {
      const qSubject = entry?.question?.subject;
      if (!qSubject) return false;
      const sid = typeof qSubject === 'object' ? String(qSubject._id || qSubject) : String(qSubject);
      return sid === subjectId;
    }),
    _hiddenCount: (section.questions || []).reduce((count, entry) => {
      const qSubject = entry?.question?.subject;
      if (!qSubject) return count + 1;
      const sid = typeof qSubject === 'object' ? String(qSubject._id || qSubject) : String(qSubject);
      return sid === subjectId ? count : count + 1;
    }, 0),
  }));
  return data;
}

// ==================== ADMIN ROUTES ====================

// Get all tests (admin)
router.get('/admin/all', auth, testManagerOnly, async (req, res) => {
  try {
    const teacherSubjectId = getTeacherSubjectId(req.currentUser);
    const tests = await Test.find({ testType: { $ne: 'dpp' } })
      .populate('createdBy', 'name')
      .populate({
        path: 'sections.questions.question',
        select: 'subject',
      })
      .sort({ createdAt: -1 });
    if (!teacherSubjectId) return res.json(tests);
    const filtered = tests.map((t) => filterTestBySubjectForTeacher(t, teacherSubjectId));
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all DPPs (admin/coordinator)
router.get('/admin/dpps', auth, testManagerOnly, async (req, res) => {
  try {
    const teacherSubjectId = getTeacherSubjectId(req.currentUser);
    const query = { testType: 'dpp' };
    if (teacherSubjectId) {
      query.subject = teacherSubjectId;
    }
    const dpps = await Test.find(query)
      .populate('createdBy', 'name')
      .populate({
        path: 'sections.questions.question',
        select: 'subject',
      })
      .sort({ createdAt: -1 });
    res.json(dpps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create test (admin only)
router.post('/', auth, testManagerOnly, async (req, res) => {
  try {
    const { name, description, duration, sections, scheduledAt, mode, syllabus, testType, subject, chapter, topic } = req.body;
    const test = new Test({
      name,
      description,
      duration,
      sections: sections || [],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      mode: mode || 'real',
      syllabus: syllabus || '',
      testType: testType || 'standard',
      subject: subject || null,
      chapter: chapter || null,
      topic: topic || null,
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

async function downloadAnswerKeySectionwiseHandler(req, res) {
  try {
    const test = await Test.findById(req.params.id)
      .populate({
        path: 'sections.questions.question',
        select: 'type correctOption correctOptions correctNumericalAnswer',
      })
      .lean();

    if (!test) return res.status(404).json({ message: 'Test not found' });

    const fileName = `${(test.name || 'test').replace(/[^a-z0-9_-]/gi, '_')}_sectionwise_answer_key.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // --- Modern Header Card Design ---
    doc.fillColor('#f3f4f6').roundedRect(left, 30, contentW, 45, 6).fill();

    doc.fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(test.name || 'Test Paper', left + 12, 38, { width: contentW - 140, lineBreak: false });

    doc.fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(9)
      .text('Section-wise Answer Key', left + 12, 54);

    const badgeW = 90;
    const badgeX = left + contentW - badgeW - 12;
    doc.fillColor('#3b82f6').roundedRect(badgeX, 39, badgeW, 20, 4).fill();
    doc.fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('ANSWER KEY', badgeX, 45, { width: badgeW, align: 'center' });

    // --- Prepare List of Elements ---
    const elements = [];
    (test.sections || []).forEach((section, sectionIndex) => {
      elements.push({
        type: 'section',
        title: section.name || `Section ${sectionIndex + 1}`,
      });

      const qList = section.questions || [];
      if (qList.length === 0) {
        elements.push({
          type: 'empty',
          text: 'No questions in this section',
        });
      } else {
        qList.forEach((entry, index) => {
          const q = entry.question || {};
          let answer = '-';

          if (q.type === 'mcq') answer = q.correctOption || '-';
          else if (q.type === 'msq') answer = Array.isArray(q.correctOptions) && q.correctOptions.length ? q.correctOptions.join(', ') : '-';
          else if (q.type === 'numerical') {
            answer = q.correctNumericalAnswer === null || q.correctNumericalAnswer === undefined
              ? '-'
              : String(q.correctNumericalAnswer);
          }

          let shortType = (q.type || '-').toUpperCase();
          if (shortType === 'NUMERICAL') shortType = 'NUM';

          elements.push({
            type: 'question',
            qNo: `Q${index + 1}`,
            qType: shortType,
            answer,
          });
        });
      }
    });

    // --- Dynamic Layout Parameters ---
    let numCols = 4;
    let gap = 16;
    let rowHeight = 18;
    let headerHeight = 22;
    let fontSize = 9;
    
    // Estimate Heights to dynamically adjust scale
    const getEstHeight = (el) => {
      if (el.type === 'section') return headerHeight;
      if (el.type === 'empty') return rowHeight;
      return rowHeight;
    };

    const totalEstHeight = elements.reduce((sum, el) => sum + getEstHeight(el), 0);
    const colStartY = 90;
    const availableHeight = doc.page.height - 36 - colStartY; // 842.89 - 36 - 90 = 716.89

    if (totalEstHeight > 4 * availableHeight) {
      numCols = 5;
      gap = 12;
      if (totalEstHeight > 5 * availableHeight) {
        rowHeight = 14.5;
        fontSize = 7.5;
        headerHeight = 18;
      }
    }

    const colWidth = (contentW - (numCols - 1) * gap) / numCols;

    // --- Balanced Column Distribution (Greedy with Orphan Avoidance) ---
    const columnsElements = Array.from({ length: numCols }, () => []);
    let currentCol = 0;
    let currentColHeight = 0;
    const targetColHeight = totalEstHeight / numCols;

    elements.forEach((el, idx) => {
      const elHeight = getEstHeight(el);
      let shouldSwitch = false;

      if (currentCol < numCols - 1) {
        if (currentColHeight + elHeight > targetColHeight) {
          shouldSwitch = true;
        }
        // Avoid orphan headers: if this is a section header and column is already 70% full, switch
        if (el.type === 'section' && currentColHeight > targetColHeight * 0.7) {
          shouldSwitch = true;
        }
      }

      if (shouldSwitch) {
        currentCol++;
        currentColHeight = 0;
      }

      columnsElements[currentCol].push(el);
      currentColHeight += elHeight;
    });

    // --- Draw the Balanced Columns ---
    columnsElements.forEach((colElements, colIdx) => {
      const colX = left + colIdx * (colWidth + gap);
      let currentY = colStartY;
      
      // Calculate total height of elements in this column to draw a card container
      const colHeight = colElements.reduce((sum, el) => sum + getEstHeight(el), 0);
      
      // Draw elegant column container card
      doc.fillColor('#ffffff')
        .roundedRect(colX, colStartY, colWidth, colHeight, 6)
        .fill();
        
      doc.lineWidth(0.8)
        .roundedRect(colX, colStartY, colWidth, colHeight, 6)
        .strokeColor('#e2e8f0')
        .stroke();

      let qIndexInCol = 0; // For alternating background zebra-striping

      colElements.forEach((el) => {
        const elHeight = getEstHeight(el);

        if (el.type === 'section') {
          // Draw a sleek section header banner with solid background
          doc.fillColor('#1e3a8a') // Primary dark blue background for section
            .rect(colX, currentY, colWidth, elHeight)
            .fill();
            
          // Draw subtle top/bottom borders for the banner
          doc.lineWidth(0.5)
            .moveTo(colX, currentY)
            .lineTo(colX + colWidth, currentY)
            .strokeColor('#172554')
            .stroke();
            
          doc.moveTo(colX, currentY + elHeight)
            .lineTo(colX + colWidth, currentY + elHeight)
            .strokeColor('#172554')
            .stroke();

          // Title text in white
          doc.fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(fontSize)
            .text(el.title, colX + 8, currentY + (elHeight - fontSize) / 2 - 1, { width: colWidth - 16, lineBreak: false });
            
          currentY += elHeight;
        } else if (el.type === 'empty') {
          doc.fillColor('#6b7280')
            .font('Helvetica-Oblique')
            .fontSize(fontSize - 0.5)
            .text(el.text, colX + 8, currentY + (elHeight - fontSize) / 2, { width: colWidth - 16 });
          
          currentY += elHeight;
        } else {
          // Question Row
          // Draw zebra striping
          if (qIndexInCol % 2 === 0) {
            doc.fillColor('#f8fafc') // Slate 50 for very premium light blue-gray tone
              .rect(colX + 0.5, currentY + 0.5, colWidth - 1, elHeight - 1)
              .fill();
          }
          
          // Draw a very subtle bottom border for rows (except if it's the last element of the column)
          doc.lineWidth(0.4)
            .moveTo(colX, currentY + elHeight)
            .lineTo(colX + colWidth, currentY + elHeight)
            .strokeColor('#f1f5f9')
            .stroke();

          // Pad question number (e.g. Q01, Q09) for perfect vertical alignment
          const padQNo = el.qNo.replace(/^Q(\d)$/, 'Q0$1');

          // Question number label
          doc.fillColor('#475569') // Cool gray slate
            .font('Helvetica-Bold')
            .fontSize(fontSize - 0.5)
            .text(padQNo, colX + 8, currentY + (elHeight - (fontSize - 0.5)) / 2 - 0.5);

          // Type badge card (MCQ, MSQ, NUM)
          let bgBadge = '#e2e8f0';
          let textBadge = '#475569';
          if (el.qType === 'MCQ') {
            bgBadge = '#e0f2fe'; // light sky blue
            textBadge = '#0369a1';
          } else if (el.qType === 'MSQ') {
            bgBadge = '#faf5ff'; // light purple
            textBadge = '#7e22ce';
          } else if (el.qType === 'NUM') {
            bgBadge = '#fef3c7'; // light amber
            textBadge = '#b45309';
          }

          const badgeW = numCols === 5 ? 20 : 24;
          const badgeH = 10;
          const badgeX = colX + (numCols === 5 ? 30 : 34);
          const badgeY = currentY + (elHeight - badgeH) / 2;

          doc.fillColor(bgBadge)
            .roundedRect(badgeX, badgeY, badgeW, badgeH, 2)
            .fill();

          doc.fillColor(textBadge)
            .font('Helvetica-Bold')
            .fontSize(6)
            .text(el.qType, badgeX, badgeY + 2, { width: badgeW, align: 'center' });

          // Correct Answer label with dynamic font adjustment
          const answerX = colX + (numCols === 5 ? 56 : 64);
          const answerW = colWidth - (numCols === 5 ? 60 : 70);
          const ansFontSize = el.answer.length > 7 ? fontSize - 1 : fontSize;

          doc.fillColor('#0f172a') // Dark slate
            .font('Helvetica-Bold')
            .fontSize(ansFontSize)
            .text(el.answer, answerX, currentY + (elHeight - ansFontSize) / 2 - 0.5, { width: answerW, lineBreak: false });

          currentY += elHeight;
          qIndexInCol++;
        }
      });
    });

    // --- Draw Footer ---
    const footerY = doc.page.height - 24;
    doc.fillColor('#94a3b8') // light slate gray
      .font('Helvetica')
      .fontSize(7)
      .text('Generated automatically by Garud Classes Test Portal', left, footerY, { width: contentW / 2, align: 'left' });
      
    doc.text('Page 1 of 1', left + contentW / 2, footerY, { width: contentW / 2, align: 'right' });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

router.get('/admin/:id/download-pdf', auth, testManagerOnly, downloadPdfHandler);
router.get('/:id/download-pdf', auth, testManagerOnly, downloadPdfHandler);
router.get('/admin/:id/download-answer-key-sectionwise', auth, testManagerOnly, downloadAnswerKeySectionwiseHandler);
router.get('/:id/download-answer-key-sectionwise', auth, testManagerOnly, downloadAnswerKeySectionwiseHandler);

// Get single test (admin - full details)
router.get('/admin/:id', auth, testManagerOnly, async (req, res) => {
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
    const teacherSubjectId = getTeacherSubjectId(req.currentUser);
    if (!teacherSubjectId) return res.json({ test, teacherSubjectId: null });
    res.json({ test: filterTestBySubjectForTeacher(test, teacherSubjectId), teacherSubjectId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update test (admin)
router.put('/:id', auth, testManagerOnly, async (req, res) => {
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
router.post('/:id/sections', auth, testManagerOnly, async (req, res) => {
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
router.delete('/:testId/sections/:sectionId', auth, testManagerOnly, async (req, res) => {
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
router.post('/:testId/sections/:sectionId/questions', auth, testManagerOnly, async (req, res) => {
  try {
    const { questionId, positiveMarks, negativeMarks } = req.body;
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const section = test.sections.id(req.params.sectionId);
    if (!section) return res.status(404).json({ message: 'Section not found' });

    const question = await Question.findById(questionId).select('subject');
    if (!question) return res.status(404).json({ message: 'Question not found' });
    const teacherSubjectId = getTeacherSubjectId(req.currentUser);
    if (teacherSubjectId && String(question.subject) !== teacherSubjectId) {
      return res.status(403).json({ message: 'You can only add questions from your assigned subject.' });
    }
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

// Auto-generate questions for a section with difficulty fallback:
// requested hard -> medium -> easy -> unassigned
router.post('/:testId/sections/:sectionId/auto-generate', auth, testManagerOnly, async (req, res) => {
  try {
    const {
      subjectId,
      chapterId,
      subjectIds,
      topicIds,
      questionType,
      hardCount = 0,
      mediumCount = 0,
      easyCount = 0,
      positiveMarks,
      negativeMarks,
    } = req.body || {};

    const normalizedSubjectIds = Array.isArray(subjectIds) ? subjectIds.filter(Boolean).map(String) : [];
    const normalizedTopicIds = Array.isArray(topicIds) ? topicIds.filter(Boolean).map(String) : [];
    const singleSubjectId = subjectId ? String(subjectId) : null;
    if (!singleSubjectId && normalizedSubjectIds.length === 0) {
      return res.status(400).json({ message: 'At least one subject is required.' });
    }

    const allowedTypes = new Set(['mcq', 'msq', 'numerical']);
    if (questionType && !allowedTypes.has(questionType)) {
      return res.status(400).json({ message: 'Invalid question type.' });
    }

    const requested = {
      hard: Math.max(0, parseInt(hardCount, 10) || 0),
      medium: Math.max(0, parseInt(mediumCount, 10) || 0),
      easy: Math.max(0, parseInt(easyCount, 10) || 0),
    };
    const requestedTotal = requested.hard + requested.medium + requested.easy;
    if (requestedTotal <= 0) {
      return res.status(400).json({ message: 'At least one question is required.' });
    }

    const teacherSubjectId = getTeacherSubjectId(req.currentUser);
    const effectiveSubjectIds = normalizedSubjectIds.length ? normalizedSubjectIds : (singleSubjectId ? [singleSubjectId] : []);
    if (teacherSubjectId && effectiveSubjectIds.some((sid) => sid !== teacherSubjectId)) {
      return res.status(403).json({ message: 'You can only auto-generate from your assigned subject.' });
    }

    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    const section = test.sections.id(req.params.sectionId);
    if (!section) return res.status(404).json({ message: 'Section not found' });

    const alreadyInTest = new Set(
      (test.sections || []).flatMap((s) => (s.questions || []).map((q) => String(q.question)))
    );

    const pickedIds = new Set();
    const picked = [];
    const baseFilter = {};
    if (effectiveSubjectIds.length === 1) baseFilter.subject = effectiveSubjectIds[0];
    else baseFilter.subject = { $in: effectiveSubjectIds };
    if (chapterId) baseFilter.chapter = chapterId;
    if (normalizedTopicIds.length) baseFilter.topic = { $in: normalizedTopicIds };
    if (questionType) baseFilter.type = questionType;

    async function pickFromDifficulty(difficulty, limit) {
      if (limit <= 0) return 0;
      const list = await Question.find({ ...baseFilter, difficulty })
        .select('_id')
        .lean();
      let added = 0;
      for (const q of list) {
        const qid = String(q._id);
        if (alreadyInTest.has(qid) || pickedIds.has(qid)) continue;
        pickedIds.add(qid);
        picked.push(qid);
        added += 1;
        if (added >= limit) break;
      }
      return added;
    }

    async function fulfillWithFallback(startDifficulty, countNeeded) {
      const orderMap = {
        hard: ['hard', 'medium', 'easy', 'unassigned'],
        medium: ['medium', 'easy', 'unassigned'],
        easy: ['easy', 'unassigned'],
      };
      const order = orderMap[startDifficulty] || [];
      let remaining = countNeeded;
      for (const level of order) {
        if (remaining <= 0) break;
        const got = await pickFromDifficulty(level, remaining);
        remaining -= got;
      }
      return countNeeded - remaining;
    }

    async function fillRandomRemaining(limit) {
      if (limit <= 0) return 0;
      const list = await Question.find(baseFilter).select('_id').lean();
      const shuffled = list.sort(() => Math.random() - 0.5);
      let added = 0;
      for (const q of shuffled) {
        const qid = String(q._id);
        if (alreadyInTest.has(qid) || pickedIds.has(qid)) continue;
        pickedIds.add(qid);
        picked.push(qid);
        added += 1;
        if (added >= limit) break;
      }
      return added;
    }

    let hardPicked = await fulfillWithFallback('hard', requested.hard);
    let mediumPicked = await fulfillWithFallback('medium', requested.medium);
    let easyPicked = await fulfillWithFallback('easy', requested.easy);

    if (hardPicked < requested.hard) {
      hardPicked += await fillRandomRemaining(requested.hard - hardPicked);
    }
    if (mediumPicked < requested.medium) {
      mediumPicked += await fillRandomRemaining(requested.medium - mediumPicked);
    }
    if (easyPicked < requested.easy) {
      easyPicked += await fillRandomRemaining(requested.easy - easyPicked);
    }

    if (!picked.length) {
      return res.status(400).json({ message: 'No matching questions available for selected criteria.' });
    }

    const pm = positiveMarks || 4;
    const nm = negativeMarks || 1;
    picked.forEach((qid) => {
      section.questions.push({ question: qid, positiveMarks: pm, negativeMarks: nm });
    });
    await test.save();

    const populated = await Test.findById(test._id).populate({
      path: 'sections.questions.question',
      populate: [
        { path: 'subject', select: 'name' },
        { path: 'chapter', select: 'name' },
        { path: 'topic', select: 'name' },
      ],
    });

    const totalMissing = requestedTotal - picked.length;
    const teacherFiltered = teacherSubjectId ? filterTestBySubjectForTeacher(populated, teacherSubjectId) : populated;
    return res.json({
      test: teacherFiltered,
      summary: {
        requested,
        added: {
          hard: hardPicked,
          medium: mediumPicked,
          easy: easyPicked,
          total: picked.length,
        },
        missing: totalMissing > 0 ? totalMissing : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove question from section
router.delete(
  '/:testId/sections/:sectionId/questions/:questionEntryId',
  auth,
  testManagerOnly,
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
      const teacherSubjectId = getTeacherSubjectId(req.currentUser);
      if (!teacherSubjectId) return res.json(populated);
      res.json(filterTestBySubjectForTeacher(populated, teacherSubjectId));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get test results/attempts (admin)
router.get('/:id/results', auth, adminOrCoordinator, async (req, res) => {
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
router.get('/:id/results/:attemptId', auth, adminOrCoordinator, async (req, res) => {
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

// Export test results to CSV
router.get('/:id/export/csv', auth, adminOrCoordinator, async (req, res) => {
  try {
    const Test = require('../models/Test');
    const TestAttempt = require('../models/TestAttempt');
    const User = require('../models/User');

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    const attempts = await TestAttempt.find({ test: test._id, isSubmitted: true })
      .populate('user', 'name email rollNo')
      .populate('batch', 'name')
      .sort({ totalScore: -1 });

    const testSections = test.sections || [];

    const getSafeId = (val) => {
      if (!val) return '';
      if (val._id) return val._id.toString();
      return val.toString();
    };

    const rowsData = attempts.map((r, index) => {
      const studentName = r.user?.name || `Student Roll ${r.rollNo}`;
      const studentEmail = r.user?.email || `${r.rollNo}@garud.com`;
      const rollNo = r.rollNo || r.user?.rollNo || '—';
      const batchName = r.batch?.name || '—';

      const sectionStats = {};
      let totalCorrect = 0;
      let totalIncorrect = 0;
      let totalAttempted = 0;
      let totalPositive = 0;
      let totalNegative = 0;

      testSections.forEach((sec) => {
        const secIdStr = getSafeId(sec._id);
        let secCorrect = 0;
        let secIncorrect = 0;
        let secAttempted = 0;
        let secPositiveScore = 0;
        let secNegativeScore = 0;

        sec.questions.forEach((qEntry) => {
          const qIdStr = getSafeId(qEntry.question);
          const ans = (r.answers || []).find(a => 
            a.question && getSafeId(a.question) === qIdStr && 
            a.sectionId && getSafeId(a.sectionId) === secIdStr
          );

          if (ans) {
            const isAttempt = !!(
              ans.selectedOption || 
              (ans.selectedOptions && ans.selectedOptions.length > 0) || 
              ans.numericalAnswer !== null
            );

            if (isAttempt) {
              secAttempted++;
              if (ans.isCorrect) {
                secCorrect++;
                secPositiveScore += qEntry.positiveMarks || 4;
              } else {
                secIncorrect++;
                secNegativeScore += qEntry.negativeMarks || 1;
              }
            }
          }
        });

        totalCorrect += secCorrect;
        totalIncorrect += secIncorrect;
        totalAttempted += secAttempted;
        totalPositive += secPositiveScore;
        totalNegative += secNegativeScore;

        sectionStats[sec.name] = {
          correct: secCorrect,
          incorrect: secIncorrect,
          attempted: secAttempted,
          score: secPositiveScore - secNegativeScore
        };
      });

      const rawScore = r.totalScore;
      const maxScore = r.maxScore || 0;
      const pct = maxScore > 0 ? ((rawScore / maxScore) * 100).toFixed(2) : '0.00';

      return {
        rank: index + 1,
        studentName,
        studentEmail,
        rollNo,
        batchName,
        sectionStats,
        totalCorrect,
        totalIncorrect,
        totalAttempted,
        totalPositive,
        totalNegative,
        rawScore,
        maxScore,
        pct
      };
    });

    let csvHeader = 'Rank,Roll Number,Student Name,Email,Batch';
    testSections.forEach(sec => {
      csvHeader += `,${sec.name} Correct,${sec.name} Incorrect,${sec.name} Attempted,${sec.name} Score`;
    });
    csvHeader += ',Total Correct,Total Incorrect,Total Attempted,Total Positive Marks,Total Negative Marks,Raw Score,Max Score,Percentage (%)\n';

    let csvContent = csvHeader;
    rowsData.forEach(row => {
      let line = `"${row.rank}","${row.rollNo}","${row.studentName}","${row.studentEmail}","${row.batchName}"`;
      testSections.forEach(sec => {
        const stats = row.sectionStats[sec.name];
        line += `,"${stats.correct}","${stats.incorrect}","${stats.attempted}","${stats.score}"`;
      });
      line += `,"${row.totalCorrect}","${row.totalIncorrect}","${row.totalAttempted}","${row.totalPositive}","${row.totalNegative}","${row.rawScore}","${row.maxScore}","${row.pct}"\n`;
      csvContent += line;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=results-${test.name.replace(/\s+/g, '_')}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('[EXPORT CSV ERROR]:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export test results to Excel
router.get('/:id/export/excel', auth, adminOrCoordinator, async (req, res) => {
  try {
    const Test = require('../models/Test');
    const TestAttempt = require('../models/TestAttempt');
    const User = require('../models/User');

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    const attempts = await TestAttempt.find({ test: test._id, isSubmitted: true })
      .populate('user', 'name email rollNo')
      .populate('batch', 'name')
      .sort({ totalScore: -1 });

    const testSections = test.sections || [];

    const getSafeId = (val) => {
      if (!val) return '';
      if (val._id) return val._id.toString();
      return val.toString();
    };

    const rowsData = attempts.map((r, index) => {
      const studentName = r.user?.name || `Student Roll ${r.rollNo}`;
      const studentEmail = r.user?.email || `${r.rollNo}@garud.com`;
      const rollNo = r.rollNo || r.user?.rollNo || '—';
      const batchName = r.batch?.name || '—';

      const sectionStats = {};
      let totalCorrect = 0;
      let totalIncorrect = 0;
      let totalAttempted = 0;
      let totalPositive = 0;
      let totalNegative = 0;

      testSections.forEach((sec) => {
        const secIdStr = getSafeId(sec._id);
        let secCorrect = 0;
        let secIncorrect = 0;
        let secAttempted = 0;
        let secPositiveScore = 0;
        let secNegativeScore = 0;

        sec.questions.forEach((qEntry) => {
          const qIdStr = getSafeId(qEntry.question);
          const ans = (r.answers || []).find(a => 
            a.question && getSafeId(a.question) === qIdStr && 
            a.sectionId && getSafeId(a.sectionId) === secIdStr
          );

          if (ans) {
            const isAttempt = !!(
              ans.selectedOption || 
              (ans.selectedOptions && ans.selectedOptions.length > 0) || 
              ans.numericalAnswer !== null
            );

            if (isAttempt) {
              secAttempted++;
              if (ans.isCorrect) {
                secCorrect++;
                secPositiveScore += qEntry.positiveMarks || 4;
              } else {
                secIncorrect++;
                secNegativeScore += qEntry.negativeMarks || 1;
              }
            }
          }
        });

        totalCorrect += secCorrect;
        totalIncorrect += secIncorrect;
        totalAttempted += secAttempted;
        totalPositive += secPositiveScore;
        totalNegative += secNegativeScore;

        sectionStats[sec.name] = {
          correct: secCorrect,
          incorrect: secIncorrect,
          attempted: secAttempted,
          score: secPositiveScore - secNegativeScore
        };
      });

      const rawScore = r.totalScore;
      const maxScore = r.maxScore || 0;
      const pct = maxScore > 0 ? ((rawScore / maxScore) * 100).toFixed(2) : '0.00';

      return {
        rank: index + 1,
        studentName,
        studentEmail,
        rollNo,
        batchName,
        sectionStats,
        totalCorrect,
        totalIncorrect,
        totalAttempted,
        totalPositive,
        totalNegative,
        rawScore,
        maxScore,
        pct
      };
    });

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>OMR Results</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; }
          td, th { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center; }
          .header-title { background-color: #1e3a8a; color: #ffffff; font-size: 16pt; font-weight: bold; height: 40px; text-align: left; }
          .meta-row { background-color: #f8fafc; font-size: 10pt; color: #64748b; text-align: left; border-bottom: 2px solid #cbd5e1; }
          .col-hdr { background-color: #334155; color: #ffffff; font-weight: bold; }
          .sec-hdr { background-color: #475569; color: #ffffff; font-weight: bold; }
          .rank-1 { background-color: #fef08a; font-weight: bold; }
          .rank-2 { background-color: #f3f4f6; font-weight: bold; }
          .rank-3 { background-color: #ffedd5; font-weight: bold; }
          .stat-correct { background-color: #dcfce7; color: #15803d; }
          .stat-incorrect { background-color: #fee2e2; color: #b91c1c; }
          .stat-attempted { background-color: #faf5ff; color: #6b21a8; }
          .stat-score { background-color: #f8fafc; font-weight: bold; }
          .overall-cell { background-color: #eff6ff; font-weight: bold; }
          .text-left { text-align: left; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <th colspan="${5 + testSections.length * 4 + 8}" class="header-title">🦅 GARUD CLASSES — OMR TEST RESULTS LEADERBOARD</th>
          </tr>
          <tr class="meta-row">
            <td colspan="${5 + testSections.length * 4 + 8}" class="text-left">
              <strong>Test Name:</strong> ${test.name} | 
              <strong>Exported At:</strong> ${new Date().toLocaleString()} | 
              <strong>Total Records:</strong> ${rowsData.length}
            </td>
          </tr>
          <tr>
            <th rowspan="2" class="col-hdr">Rank</th>
            <th rowspan="2" class="col-hdr">Roll Number</th>
            <th rowspan="2" class="col-hdr">Student Name</th>
            <th rowspan="2" class="col-hdr">Email</th>
            <th rowspan="2" class="col-hdr">Batch</th>
    `;

    testSections.forEach(sec => {
      html += `<th colspan="4" class="sec-hdr">${sec.name}</th>`;
    });

    html += `
            <th colspan="8" class="col-hdr" style="background-color: #1d4ed8;">Overall Performance Summary</th>
          </tr>
          <tr>
    `;

    testSections.forEach(() => {
      html += `
        <th class="col-hdr">Correct</th>
        <th class="col-hdr">Incorrect</th>
        <th class="col-hdr">Attempted</th>
        <th class="col-hdr">Score</th>
      `;
    });

    html += `
            <th class="col-hdr" style="background-color: #1e40af;">Total Correct</th>
            <th class="col-hdr" style="background-color: #1e40af;">Total Incorrect</th>
            <th class="col-hdr" style="background-color: #1e40af;">Total Attempted</th>
            <th class="col-hdr" style="background-color: #1e40af;">Positive Marks</th>
            <th class="col-hdr" style="background-color: #b91c1c;">Negative Marks</th>
            <th class="col-hdr" style="background-color: #1e40af;">Raw Score</th>
            <th class="col-hdr" style="background-color: #1e40af;">Max Score</th>
            <th class="col-hdr" style="background-color: #1e40af;">Accuracy (%)</th>
          </tr>
    `;

    rowsData.forEach(row => {
      let rankClass = '';
      if (row.rank === 1) rankClass = ' class="rank-1"';
      else if (row.rank === 2) rankClass = ' class="rank-2"';
      else if (row.rank === 3) rankClass = ' class="rank-3"';

      html += `
        <tr>
          <td${rankClass}>${row.rank}</td>
          <td>'${row.rollNo}</td>
          <td class="text-left">${row.studentName}</td>
          <td class="text-left">${row.studentEmail}</td>
          <td>${row.batchName}</td>
      `;

      testSections.forEach(sec => {
        const stats = row.sectionStats[sec.name];
        html += `
          <td class="stat-correct">${stats.correct}</td>
          <td class="stat-incorrect">${stats.incorrect}</td>
          <td class="stat-attempted">${stats.attempted}</td>
          <td class="stat-score">${stats.score}</td>
        `;
      });

      const pctStyle = parseFloat(row.pct) >= 60.0 ? 'color: #166534; background-color: #dcfce7;' : 'color: #991b1b; background-color: #fee2e2;';

      html += `
          <td class="overall-cell">${row.totalCorrect}</td>
          <td class="overall-cell">${row.totalIncorrect}</td>
          <td class="overall-cell">${row.totalAttempted}</td>
          <td class="overall-cell" style="color: #166534;">+${row.totalPositive}</td>
          <td class="overall-cell" style="color: #b91c1c;">-${row.totalNegative}</td>
          <td class="overall-cell" style="font-weight: bold; background-color: #dbeafe;">${row.rawScore}</td>
          <td class="overall-cell">${row.maxScore}</td>
          <td class="overall-cell" style="${pctStyle}">${row.pct}%</td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename=results-${test.name.replace(/\s+/g, '_')}.xls`);
    res.status(200).send(html);
  } catch (error) {
    console.error('[EXPORT EXCEL ERROR]:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
