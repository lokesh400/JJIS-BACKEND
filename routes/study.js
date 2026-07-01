const express = require('express');
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
// const { getSignedR2Url } = require('../config/r2');
const { auth } = require('../middleware/auth');

const router = express.Router();

async function ensureCoursePurchasedByUser(courseId, userId) {
  const purchase = await Purchase.findOne({
    user: userId,
    itemType: 'Course',
    itemId: courseId,
    status: 'success',
  }).lean();

  return !!purchase;
}

function sanitizeLecturePdfsForResponse(pdfs) {
  if (!Array.isArray(pdfs)) return [];
  return pdfs
    .map((pdf) => ({
      title: String(pdf?.title || '').trim(),
      link: String(pdf?.link || '').trim(),
    }))
    .filter((pdf) => pdf.title && pdf.link);
}

function mapLectureForOtt(lecture, index) {
  const title = String(lecture?.title || '').trim();
  return {
    _id: lecture?._id,
    videoname: title || `Lecture ${index + 1}`,
    hasVideo: !!String(lecture?.videoLink || '').trim(),
    pdfs: sanitizeLecturePdfsForResponse(lecture?.pdfs),
  };
}

function mapLectureForOttDetail(lecture, index) {
  return {
    _id: lecture?._id,
    title: String(lecture?.title || '').trim() || `Lecture ${index + 1}`,
    videoLink: String(lecture?.videoLink || '').trim(),
    pdfs: sanitizeLecturePdfsForResponse(lecture?.pdfs),
  };
}

function extractObjectKey(videoRef) {
  if (!videoRef) return null;

  const value = String(videoRef).trim();
  if (!value) return null;

  // Accept both raw object keys and full URLs stored in DB.
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');

  try {
    const parsed = new URL(value);
    return parsed.pathname.replace(/^\/+/, '');
  } catch {
    return null;
  }
}

// GET /api/ott/my-courses
// Returns purchased courses with minimal metadata (no raw video URLs).
router.get('/my-courses', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({
      user: req.user._id,
      itemType: 'Course',
      status: 'success',
    })
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = purchases.map((purchase) => purchase.itemId);
    const courses = courseIds.length
      ? await Course.find({ _id: { $in: courseIds } })
          .select('_id name price madeFor lectures')
          .lean()
      : [];

    const courseMap = new Map(courses.map((course) => [String(course._id), course]));

    const myCourses = purchases
      .map((purchase) => {
        const course = courseMap.get(String(purchase.itemId));
        if (!course) return null;
        return {
          purchaseId: purchase._id,
          purchasedAt: purchase.createdAt,
          amount: purchase.amount,
          method: purchase.method,
          status: purchase.status,
          course: {
            _id: course._id,
            name: course.name,
            price: course.price,
            modefor: course.madeFor,
            videolist: Array.isArray(course.lectures)
              ? course.lectures.map((lecture, index) => mapLectureForOtt(lecture, index))
              : [],
          },
        };
      })
      .filter(Boolean);

    res.json(myCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ott/explore-courses
// Returns only minimal fields for published courses.
router.get('/explore-courses', auth, async (req, res) => {
  try {
    const courses = await Course.find({ isPublished: true })
      .select('_id name price madeFor')
      .sort({ createdAt: -1 })
      .lean();

    const result = courses.map((course) => ({
      _id: course._id,
      name: course.name,
      price: course.price,
      modefor: course.madeFor,
    }));

    console.log('Explore courses fetched:', result, 'for user:', req.user._id);

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ott/published/:id
// GET /api/ott/courses/published/:courseId
// Compatibility detail endpoints for mobile clients.
router.get(['/published/:id', '/courses/published/:courseId'], auth, async (req, res) => {
  try {
    const courseId = String(req.params.id || req.params.courseId || '').trim();
    if (!courseId) {
      return res.status(400).json({ message: 'course id is required' });
    }

    const course = await Course.findOne({ _id: courseId, isPublished: true })
      .populate('tests', 'name duration mode testType scheduledAt syllabus')
      .lean();
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const purchased = await ensureCoursePurchasedByUser(course._id, req.user._id);
    if (!purchased) {
      return res.status(403).json({ message: 'Purchase this course to open it' });
    }

    res.json({
      ...course,
      lectures: Array.isArray(course.lectures)
        ? course.lectures.map((lecture, index) => mapLectureForOttDetail(lecture, index))
        : [],
      lectureCount: Array.isArray(course.lectures) ? course.lectures.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ott/courses/:courseId
// Returns minimal course payload for player listing (no video URLs).
router.get('/courses/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, isPublished: true })
      .select('_id name lectures')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({
      _id: course._id,
      name: course.name,
      videolist: Array.isArray(course.lectures)
        ? course.lectures.map((lecture, index) => mapLectureForOtt(lecture, index))
        : [],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/ott/courses/:courseId/videos/:videoId/url
// Returns video URL for one lecture only after access check.
router.get('/courses/:courseId/videos/:videoId/url', auth, async (req, res) => {
  try {
    const { courseId, videoId } = req.params;

    const course = await Course.findOne({ _id: courseId, isPublished: true })
      .select('_id price lectures')
      .lean();

    if (!course) {
        console.warn(`Course not found for video access: courseId=${courseId}, videoId=${videoId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const lecture = Array.isArray(course.lectures)
      ? course.lectures.find((item) => String(item._id) === String(videoId))
      : null;

    if (!lecture) {
        console.warn(`Lecture not found in course for video access: courseId=${courseId}, videoId=${videoId}`);
      return res.status(404).json({ message: 'Video not found' });
    }

    // Paid courses require a successful purchase.
    if ((course.price || 0) > 0) {
      const purchase = await Purchase.findOne({
        user: req.user._id,
        itemType: 'Course',
        itemId: courseId,
        status: 'success',
      }).lean();

      if (!purchase) {
        console.warn(`Unauthorized video access attempt: userId=${req.user._id}, courseId=${courseId}, videoId=${videoId}`);
        return res.status(403).json({ message: 'Purchase required to access this video' });
      }
    }

    const objectKey = extractObjectKey(lecture.videoLink);
    if (!objectKey) {
      return res.status(404).json({ message: 'Video link not available for this lecture' });
    }

    const signedUrl = await getSignedR2Url(objectKey);

    console.log('Generated signed URL for video access:', {
      userId: req.user._id,
      courseId,
      videoId,
      objectKey,
    });

    res.json({
      videoId: lecture._id,
      videoname: lecture.title,
      videourl: signedUrl,
    });
  } catch (error) {
    console.error('Error in video URL generation:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
