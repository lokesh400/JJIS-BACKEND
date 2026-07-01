const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const Course = require('../models/Course');
const Purchase = require('../models/Purchase');
// const { getSignedR2Url } = require('../config/r2');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

const PLAYBACK_TOKEN_TTL_SECONDS = Math.max(Number(process.env.VIDEO_SIGNED_URL_TTL_SECONDS || 180), 30);
const PLAYBACK_SECRET = process.env.VIDEO_SIGNING_SECRET || process.env.JWT_SECRET || 'garud-course-playback-secret';

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const withPadding = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(withPadding, 'base64').toString('utf8');
}

function signPlaybackPayload(payload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', PLAYBACK_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedPayload}.${signature}`;
}

function verifyPlaybackToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Invalid playback token');
  }

  const expected = crypto
    .createHmac('sha256', PLAYBACK_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new Error('Invalid playback signature');
  }

  return JSON.parse(fromBase64Url(encodedPayload));
}

function isAllowedVideoHost(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;

    const configured = String(process.env.VIDEO_ALLOWED_HOSTS || '').trim();
    if (!configured) return true;

    const allowedHosts = configured
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch (_) {
    return false;
  }
}

function extractObjectKey(videoRef) {
  if (!videoRef) return null;

  const value = String(videoRef).trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');

  try {
    const parsed = new URL(value);
    return parsed.pathname.replace(/^\/+/, '');
  } catch (_) {
    return null;
  }
}

async function resolvePlaybackSource(videoRef) {
  const value = String(videoRef || '').trim();
  if (!value) {
    throw new Error('No video link configured for this lecture');
  }

  if (/^https?:\/\//i.test(value)) {
    return {
      sourceUrl: value,
      trustedSource: false,
    };
  }

  const objectKey = extractObjectKey(value);
  if (!objectKey) {
    throw new Error('Invalid lecture video reference');
  }

  const signedUrl = await getSignedR2Url(objectKey);
  return {
    sourceUrl: signedUrl,
    trustedSource: true,
  };
}

async function ensureCoursePurchasedByUser(courseId, userId) {
  const purchase = await Purchase.findOne({
    user: userId,
    itemType: 'Course',
    itemId: courseId,
    status: 'success',
  }).lean();

  return !!purchase;
}

const sanitizeLecturePdfs = (pdfs) => {
  if (!Array.isArray(pdfs)) return [];
  return pdfs
    .map((pdf) => ({
      title: String(pdf?.title || '').trim(),
      link: String(pdf?.link || '').trim(),
    }))
    .filter((pdf) => pdf.title && pdf.link);
};

const sanitizeLecture = (lecture) => ({
  title: String(lecture?.title || '').trim(),
  videoLink: String(lecture?.videoLink || '').trim(),
  status: String(lecture?.status || 'ended').trim(),
  scheduledAt: lecture?.scheduledAt ? new Date(lecture.scheduledAt) : new Date(),
  pdfs: sanitizeLecturePdfs(lecture?.pdfs),
});

const mapLectureForStudent = (lecture, index) => ({
  _id: lecture?._id,
  title: String(lecture?.title || '').trim() || `Lecture ${index + 1}`,
  videoLink: String(lecture?.videoLink || '').trim(),
  status: String(lecture?.status || 'ended').trim(),
  scheduledAt: lecture?.scheduledAt,
  pdfs: sanitizeLecturePdfs(lecture?.pdfs),
});

const sanitizeChapter = (chapter) => ({
  name: String(chapter?.name || '').trim(),
  lectures: Array.isArray(chapter?.lectures)
    ? chapter.lectures.map(sanitizeLecture).filter((l) => l.title)
    : [],
});

const sanitizeSubject = (subject) => ({
  name: String(subject?.name || '').trim(),
  chapters: Array.isArray(subject?.chapters)
    ? subject.chapters.map(sanitizeChapter).filter((c) => c.name)
    : [],
});

const mapChapterForStudent = (chapter) => ({
  _id: chapter?._id,
  name: String(chapter?.name || '').trim(),
  lectures: Array.isArray(chapter?.lectures)
    ? chapter.lectures.map((l, index) => mapLectureForStudent(l, index))
    : [],
});

const mapSubjectForStudent = (subject) => ({
  _id: subject?._id,
  name: String(subject?.name || '').trim(),
  chapters: Array.isArray(subject?.chapters)
    ? subject.chapters.map(mapChapterForStudent)
    : [],
});


// ==================== ADMIN ROUTES ====================
router.get('/admin/all', auth, adminOnly, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate('createdBy', 'name')
      .populate('purchasedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin/:id', auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('purchasedBy', 'name email')
      .lean();

    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, tags, madeFor, image, isPublished, lectures } = req.body;

    const course = new Course({
      name,
      description: description || '',
      price: Number(price) || 0,
      tags: tags ? (Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim()).filter(Boolean)) : [],
      madeFor: madeFor || 'other',
      image: image || '',
      isPublished: !!isPublished,
      lectures: Array.isArray(lectures)
        ? lectures.map(sanitizeLecture).filter((l) => l.title)
        : [],
      createdBy: req.user._id,
    });

    await course.save();
    res.status(201).json(course);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Course with this name already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, tags, madeFor, image, isPublished } = req.body;
    const update = {};

    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price) || 0;
    if (tags !== undefined) {
      update.tags = Array.isArray(tags)
        ? tags
        : String(tags).split(',').map((t) => t.trim()).filter(Boolean);
    }
    if (madeFor !== undefined) update.madeFor = madeFor;
    if (image !== undefined) update.image = image;
    if (isPublished !== undefined) update.isPublished = !!isPublished;

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('createdBy', 'name')
      .populate('purchasedBy', 'name email');

    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/lectures', auth, adminOnly, async (req, res) => {
  try {
    const { title, videoLink, pdfs } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'title is required' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    course.lectures.push({
      title: String(title).trim(),
      videoLink: String(videoLink || '').trim(),
      pdfs: sanitizeLecturePdfs(pdfs),
    });
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/lectures', auth, adminOnly, async (req, res) => {
  try {
    const { lectures } = req.body;
    if (!Array.isArray(lectures)) {
      return res.status(400).json({ message: 'lectures must be an array' });
    }

    const sanitized = lectures.map(sanitizeLecture).filter((lecture) => lecture.title);

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    course.lectures = sanitized;
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/subjects', auth, adminOnly, async (req, res) => {
  try {
    const { subjects } = req.body;
    if (!Array.isArray(subjects)) {
      return res.status(400).json({ message: 'subjects must be an array' });
    }

    const sanitized = subjects.map(sanitizeSubject).filter((s) => s.name);

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    course.subjects = sanitized;

    // Maintain backwards compatibility by compiling a flat list of lectures
    const flatLectures = [];
    sanitized.forEach(subj => {
      subj.chapters.forEach(chap => {
        chap.lectures.forEach(lec => {
          flatLectures.push(lec);
        });
      });
    });
    course.lectures = flatLectures;

    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.delete('/:id/lectures/:lectureId', auth, adminOnly, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    course.lectures = course.lectures.filter((lecture) => lecture._id.toString() !== req.params.lectureId);
    await course.save();
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/published', auth, async (req, res) => {
  try {
    const minimal = req.query.minimal === 'true' || req.query.fields === 'basic';

    if (minimal) {
      const courses = await Course.find({ isPublished: true })
        .select('_id image name description price madeFor tags lectures subjects')
        .sort({ createdAt: -1 })
        .lean();
      return res.json(
        courses.map((course) => ({
          ...course,
          subjects: Array.isArray(course.subjects)
            ? course.subjects.map(mapSubjectForStudent)
            : [],
          lectures: Array.isArray(course.lectures)
            ? course.lectures.map((lecture, index) => mapLectureForStudent(lecture, index))
            : [],
          lectureCount: Array.isArray(course.lectures) ? course.lectures.length : 0,
        }))
      );
    }

    const courses = await Course.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .lean();

    res.json(
      courses.map((course) => ({
        ...course,
        subjects: Array.isArray(course.subjects)
          ? course.subjects.map(mapSubjectForStudent)
          : [],
        lectures: Array.isArray(course.lectures)
          ? course.lectures.map((lecture, index) => mapLectureForStudent(lecture, index))
          : [],
        lectureCount: Array.isArray(course.lectures) ? course.lectures.length : 0,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/published/:id', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, isPublished: true }).lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Allow opening a course only after successful purchase/enrollment.
    const purchased = await ensureCoursePurchasedByUser(course._id, req.user._id);
    if (!purchased) {
      return res.status(403).json({ message: 'Purchase this course to open it' });
    }

    res.json({
      ...course,
      subjects: Array.isArray(course.subjects)
        ? course.subjects.map(mapSubjectForStudent)
        : [],
      lectures: Array.isArray(course.lectures)
        ? course.lectures.map((lecture, index) => mapLectureForStudent(lecture, index))
        : [],
      lectureCount: Array.isArray(course.lectures) ? course.lectures.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Generate a obfuscated YouTube playback token and status for a lecture video.
router.get('/published/:id/lectures/:lectureId/playback', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, isPublished: true }).lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const purchased = await ensureCoursePurchasedByUser(course._id, req.user._id);
    if (!purchased) {
      return res.status(403).json({ message: 'Purchase this course to open lecture content' });
    }

    let lectures = Array.isArray(course.lectures) ? [...course.lectures] : [];
    if (Array.isArray(course.subjects)) {
      course.subjects.forEach(s => {
        if (s && Array.isArray(s.chapters)) {
          s.chapters.forEach(c => {
            if (c && Array.isArray(c.lectures)) {
              lectures = lectures.concat(c.lectures);
            }
          });
        }
      });
    }

    const lecture = lectures.find((item) => String(item._id) === String(req.params.lectureId));
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Extract YouTube Video ID from videoLink
    let youtubeId = '';
    const rawLink = String(lecture.videoLink || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(rawLink)) {
      youtubeId = rawLink;
    } else {
      const urlRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/|shorts\/)([^#\&\?]*).*/;
      const match = rawLink.match(urlRegExp);
      youtubeId = (match && match[2].length === 11) ? match[2] : '';
    }
    if (!youtubeId) {
      youtubeId = rawLink;
    }

    const token = Buffer.from(youtubeId).toString('base64');

    res.json({
      token,
      status: lecture.status || 'ended',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Secure stream proxy endpoint; keeps origin video URL hidden from browser code.
router.get('/stream', auth, async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'token is required' });
    }

    const payload = verifyPlaybackToken(token);
    const now = Math.floor(Date.now() / 1000);

    if (!payload?.uid || !payload?.cid || !payload?.lid || !payload?.src || !payload?.exp) {
      return res.status(400).json({ message: 'Invalid playback payload' });
    }

    if (String(payload.uid) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Playback token is not valid for this user' });
    }

    if (Number(payload.exp) < now) {
      return res.status(401).json({ message: 'Playback token expired' });
    }

    if (!payload.trusted && !isAllowedVideoHost(payload.src)) {
      return res.status(400).json({ message: 'Video host is not allowed for streaming' });
    }

    const purchased = await ensureCoursePurchasedByUser(payload.cid, req.user._id);
    if (!purchased) {
      return res.status(403).json({ message: 'Purchase required for playback' });
    }

    const upstreamHeaders = {};
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;

    const upstream = await axios.get(payload.src, {
      responseType: 'stream',
      headers: upstreamHeaders,
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 30000,
      maxRedirects: 2,
    });

    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    passHeaders.forEach((header) => {
      const value = upstream.headers[header];
      if (value) {
        res.setHeader(header, value);
      }
    });
    res.setHeader('x-content-type-options', 'nosniff');

    res.status(upstream.status);
    upstream.data.pipe(res);
  } catch (error) {
    const status = error?.response?.status;
    if (status) {
      return res.status(status).json({ message: 'Unable to stream this lecture right now' });
    }
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
