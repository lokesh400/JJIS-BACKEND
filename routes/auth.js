const express  = require('express');
const passport = require('passport');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User     = require('../models/User');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { sendPasswordResetOtpEmail, sendPasswordResetLinkEmail } = require('../config/mailer');
const { auth, adminOnly } = require('../middleware/auth');
const Subject = require('../models/Subject');
const TotalMember = require('../models/TotalMembers');
const Purchase = require('../models/Purchase');
const TestSeries = require('../models/TestSeries');
const Course = require('../models/Course');

const router = express.Router();
const PASSWORD_RESET_TOKEN_TTL_SECONDS = Math.max(Number(process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS || 600), 60);
const PASSWORD_RESET_SECRET = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET || 'garud-password-reset-secret';

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

function signPasswordResetPayload(payload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', PASSWORD_RESET_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedPayload}.${signature}`;
}

function verifyPasswordResetToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Invalid reset token');
  }

  const expected = crypto
    .createHmac('sha256', PASSWORD_RESET_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new Error('Invalid reset token signature');
  }

  return JSON.parse(fromBase64Url(encodedPayload));
}

function normalizeLoginIdentifier(body = {}) {
  return String(body.identifier || body.email || body.username || '')
    .trim()
    .toLowerCase();
}

async function findUserByIdentifier(identifier) {
  return User.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
    ],
  }).select('_id email role contactMail username').lean();
}

async function consumeValidOtpForUser(userId, otp) {
  const otpDoc = await PasswordResetOtp.findOne({ user: userId }).lean();
  if (!otpDoc || !otpDoc.expiresAt || new Date(otpDoc.expiresAt).getTime() < Date.now()) {
    if (otpDoc?._id) await PasswordResetOtp.deleteOne({ _id: otpDoc._id });
    return false;
  }

  const otpHash = crypto.createHash('sha256').update(String(otp || '').trim()).digest('hex');
  if (otpHash !== otpDoc.otpHash) {
    return false;
  }

  await PasswordResetOtp.deleteOne({ _id: otpDoc._id });
  return true;
}

async function handlePasswordResetOtpRequest(req, res, next) {
  try {
    const identifier = normalizeLoginIdentifier(req.body);
    if (!identifier) {
      return res.status(400).json({ message: 'Login identifier is required.' });
    }

    const user = await findUserByIdentifier(identifier);

    // Avoid leaking whether an account exists for a given identifier.
    if (!user) {
      return res.json({ message: 'If this account exists, an OTP has been generated.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PasswordResetOtp.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        email: user.email,
        otpHash,
        expiresAt,
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    try {
      await sendPasswordResetOtpEmail({
        toEmail: user.email,
        otp,
        expiresInMinutes: 10,
      });
    } catch (mailError) {
      console.error(
        `[FORGOT_PASSWORD_OTP_EMAIL_ERROR] email=${user.email} reason=${mailError.message}`
      );
      // Non-production fallback keeps password reset testable even without email setup.
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[FORGOT_PASSWORD_OTP_DEV_FALLBACK] email=${user.email} otp=${otp} expiresAt=${expiresAt.toISOString()}`
        );
      }
    }

    return res.json({
      message: 'If this account exists, an OTP has been generated and sent.',
      expiresInSeconds: 600,
    });
  } catch (err) {
    return next(err);
  }
}

async function handlePasswordReset(req, res, next) {
  try {
    const rawStep = String(req.body?.step || '').trim().toLowerCase();
    const step = rawStep.replace(/\s+/g, '_').replace(/-/g, '_');

    if (step === 'request_link' || step === 'requestlink' || step === 'send_link') {
      const identifier = normalizeLoginIdentifier(req.body);
      if (!identifier) {
        return res.status(400).json({ message: 'Login identifier is required.' });
      }

      const user = await findUserByIdentifier(identifier);
      if (!user) {
        return res.json({ message: 'If this account exists, a reset link has been sent.' });
      }

      const now = Math.floor(Date.now() / 1000);
      const resetToken = signPasswordResetPayload({
        uid: String(user._id),
        email: user.email,
        purpose: 'password_reset',
        exp: now + PASSWORD_RESET_TOKEN_TTL_SECONDS,
      });
      const origin = String(req.get('origin') || '').trim();
      const baseUrl = origin || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/login?resetToken=${encodeURIComponent(resetToken)}`;

      const recipientEmail = (user.role === 'teacher' || user.role === 'admin')
        ? String(user.contactMail || '').trim().toLowerCase() || String(user.email || '').trim().toLowerCase()
        : String(user.email || '').trim().toLowerCase();

      try {
        await sendPasswordResetLinkEmail({
          toEmail: recipientEmail,
          resetUrl,
          expiresInMinutes: Math.ceil(PASSWORD_RESET_TOKEN_TTL_SECONDS / 60),
        });
      } catch (mailError) {
        console.error(`[FORGOT_PASSWORD_LINK_EMAIL_ERROR] email=${recipientEmail} reason=${mailError.message}`);
      }

      return res.json({
        message: 'If this account exists, a reset link has been sent.',
        expiresInSeconds: PASSWORD_RESET_TOKEN_TTL_SECONDS,
      });
    }

    if (step === 'request_otp' || step === 'requestotp' || step === 'send_otp') {
      return handlePasswordResetOtpRequest(req, res, next);
    }

    if (step === 'verify_otp' || step === 'verifyotp') {
      const identifier = normalizeLoginIdentifier(req.body);
      const otp = String(req.body?.otp || '').trim();

      if (!identifier || !otp) {
        return res.status(400).json({ message: 'Login identifier and OTP are required.' });
      }

      const user = await findUserByIdentifier(identifier);

      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired OTP.' });
      }

      const isValidOtp = await consumeValidOtpForUser(user._id, otp);
      if (!isValidOtp) {
        return res.status(400).json({ message: 'Invalid or expired OTP.' });
      }

      const now = Math.floor(Date.now() / 1000);
      const resetToken = signPasswordResetPayload({
        uid: String(user._id),
        email: user.email,
        purpose: 'password_reset',
        exp: now + PASSWORD_RESET_TOKEN_TTL_SECONDS,
      });

      return res.json({
        message: 'OTP verified. Continue with new password.',
        resetToken,
        expiresInSeconds: PASSWORD_RESET_TOKEN_TTL_SECONDS,
      });
    }

    if (step === 'set_new_password' || step === 'set_password' || step === 'new_password') {
      const resetToken = String(req.body?.resetToken || '').trim();
      const newPassword = String(req.body?.newPassword || '');

      if (newPassword.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }

      let userId = null;
      let email = null;

      if (resetToken) {
        let payload;
        try {
          payload = verifyPasswordResetToken(resetToken);
        } catch (_) {
          return res.status(401).json({ message: 'Invalid reset token.' });
        }

        const now = Math.floor(Date.now() / 1000);
        if (!payload?.uid || payload?.purpose !== 'password_reset' || !payload?.exp || Number(payload.exp) < now) {
          return res.status(401).json({ message: 'Reset token expired or invalid.' });
        }

        userId = payload.uid;
        email = String(payload.email || '').toLowerCase();
      } else {
        const identifier = normalizeLoginIdentifier(req.body);
        const otp = String(req.body?.otp || '').trim();
        if (!identifier || !otp) {
          return res.status(400).json({ message: 'Provide resetToken OR identifier and otp with newPassword.' });
        }

        const userForOtp = await findUserByIdentifier(identifier);
        if (!userForOtp) {
          return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        const isValidOtp = await consumeValidOtpForUser(userForOtp._id, otp);
        if (!isValidOtp) {
          return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        userId = userForOtp._id;
        email = String(userForOtp.email || '').toLowerCase();
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (email && String(user.email).toLowerCase() !== email) {
        return res.status(401).json({ message: 'Reset credentials are not valid for this user.' });
      }

      await new Promise((resolve, reject) => {
        user.setPassword(newPassword, (err) => {
          if (err) return reject(err);
          console.log(err);
          return resolve();
        });
      });
      await user.save();

      return res.json({ message: 'Password changed successfully.' });
    }

    return res.status(400).json({
      message: 'Invalid step. Use one of: request_otp, verify_otp, set_new_password.',
    });
  } catch (err) {
    return next(err);
  }
}

// Rate-limiter: max 10 auth attempts per IP per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts — please try again after 15 minutes.' },
});

// ── Register ──────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const {
      name, email, password, role,
      studentClass, targetExam, mobile, address,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const user = new User({
      name:       name.trim(),
      username:   email.trim().toLowerCase(),
      email:      email.trim().toLowerCase(),
      role:       role === 'admin' ? 'admin' : 'student',
      class:      studentClass,
      targetExam,
      mobile,
      address,
    });
    if (!user.username) user.username = user.email;

    // User.register hashes password with PBKDF2-SHA512 and saves the user
    await User.register(user, password);

    // Auto-login after registration
    req.login(user, (err) => {
      if (err) return next(err);
      return res.status(201).json({
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    });
  } catch (err) {
    if (err.name === 'UserExistsError') {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }
    next(err);
  }
});

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', authLimiter, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(400).json({ message: info?.message || 'Invalid email or password.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
    }

    // Regenerate session ID before storing auth to prevent session-fixation attacks
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({
          user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
      });
    });
  })(req, res, next);
});


router.post('/m/login', authLimiter, (req, res, next) => {
  console.log('Login attempt:', req.body.email);
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(400).json({ message: info?.message || 'Invalid email or password.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
    }

    // Regenerate session ID before storing auth to prevent session-fixation attacks
    req.session.regenerate((err) => {
      req.login(user, (err) => {
      if (err) return next(err);
  const rawCookie = res.getHeader('set-cookie');
  const cookieValue = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie)?.split(';')[0] ?? null;
  return res.status(201).json({
    cookie: cookieValue,                                          // ← add this
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});
    });
  })(req, res, next);
});

// ── Password Reset (single route, step-based) ───────────────────
router.post('/password-reset', authLimiter, async (req, res, next) => {
  return handlePasswordReset(req, res, next);
});

// ── Logout ────────────────────────────────────────────────────────
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid');   // name set in server.js
      res.json({ message: 'Logged out successfully.' });
    });
  });
});

// ── Current user ──────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  res.json({
    user: {
      id:    req.user._id,
      name:  req.user.name,
      email: req.user.email,
      role:  req.user.role,
    },
  });
});

router.get('/m/me', auth, (req, res) => {
  res.json(req.user);
});

// ── Student profile update ────────────────────────────────────────
router.put('/student/profile', auth, async (req, res, next) => {
  try {
    const { name, class: studentClass, targetExam, mobile, address } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.name       = name;
    user.class      = studentClass;
    user.targetExam = targetExam;
    user.mobile     = mobile;
    user.address    = address;
    await user.save();
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    next(err);
  }
});

///////////////////////////////
//////create team member//////
//////////////////////////////

router.post('/register/member', auth, adminOnly, async (req, res) => {
  try {
    const { name, contactMail, subjects, role } = req.body || {};
    
    let targetRole = 'teacher';
    if (['coordinator', 'admin'].includes(role)) {
      targetRole = role;
    }

    if (!name || !contactMail) {
      return res.status(400).json({ message: 'Name and contactMail are required.' });
    }
    if (['teacher', 'coordinator'].includes(targetRole) && (!Array.isArray(subjects) || subjects.length === 0)) {
      return res.status(400).json({ message: `At least one subject is required for ${targetRole}.` });
    }

    const normalizedContactMail = String(contactMail).trim().toLowerCase();
    const normalizedSubjects = Array.isArray(subjects) ? subjects : [];

    let primarySubjectDoc;
    let primarySubjectKey = 'Mathematics';
    let primarySubjectSlug = targetRole;

    if (normalizedSubjects.length > 0) {
      const subjectDocs = await Subject.find({ _id: { $in: normalizedSubjects } }, { _id: 1, name: 1 }).lean();
      const subjectMap = {
        physics: 'Physics',
        chemistry: 'Chemistry',
        biology: 'Biology',
        mathematics: 'Mathematics',
        math: 'Mathematics',
        maths: 'Mathematics',
      };
      primarySubjectDoc = subjectDocs.find((s) => subjectMap[String(s.name || '').trim().toLowerCase()]);
      if (primarySubjectDoc) {
        primarySubjectKey = subjectMap[String(primarySubjectDoc.name).trim().toLowerCase()];
        primarySubjectSlug = primarySubjectKey.toLowerCase();
      }
    }

    if (targetRole === 'teacher' && !primarySubjectDoc) {
      return res.status(400).json({
        message: 'Auto-email is supported only for Physics, Chemistry, Biology, Mathematics.',
      });
    }

    let counterDoc = await TotalMember.findOne();
    if (!counterDoc) {
      counterDoc = await TotalMember.create({
        Physics: 0,
        Chemistry: 0,
        Mathematics: 0,
        Biology: 0,
        Coordinator: 0,
        TeamMembers: 0,
      });
    }

    let incrementKey = primarySubjectKey;
    if (targetRole === 'coordinator') {
      incrementKey = 'Coordinator';
      primarySubjectSlug = 'coordinator';
    }

    const updateObj = { [incrementKey]: 1, TeamMembers: 1 };

    const updatedCounter = await TotalMember.findByIdAndUpdate(
      counterDoc._id,
      { $inc: updateObj },
      { new: true }
    ).lean();

    const countVal = Number(updatedCounter?.[incrementKey] || 0);
    const generatedEmail = `${primarySubjectSlug}.${countVal}@garudclasses.com`;

    const tempPassword = normalizedContactMail;

    const user = new User({
      name: String(name).trim(),
      username: generatedEmail,
      email: generatedEmail,
      contactMail: normalizedContactMail,
      role: targetRole,
      subjects: normalizedSubjects,
    });
    if (!user.username) user.username = user.email;

    await User.register(user, tempPassword);

    return res.status(201).json({
      message: 'Member registered successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        contactMail: user.contactMail || null,
        subjects: user.subjects || [],
      },
      generatedFromSubject: primarySubjectKey,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    if (err.name === 'UserExistsError') {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }
    return res.status(500).json({ message: err.message || 'Failed to register member.' });
  }
});

router.get('/team', auth, adminOnly, async (req, res, next) => {
  try {
    const users = await User.find(
      { role: { $in: ['teacher', 'coordinator', 'admin'] } },
      { name: 1, email: 1, contactMail: 1, role: 1, mobile: 1, subjects: 1, isActive: 1, createdAt: 1 }
    )
      .populate('subjects', '_id name')
      .sort({ role: 1, name: 1 })
      .lean();

    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.patch('/team/:id/status', auth, adminOnly, async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean.' });
    }

    if (req.user._id.toString() === req.params.id && !isActive) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    res.json({ message: `Member ${isActive ? 'activated' : 'deactivated'} successfully.`, user });
  } catch (err) {
    next(err);
  }
});

router.put('/team/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, contactMail, role, subjects } = req.body;
    if (!name || !contactMail || !role) {
      return res.status(400).json({ message: 'Name, contact email and role are required.' });
    }

    if (['teacher', 'coordinator'].includes(role) && (!Array.isArray(subjects) || subjects.length === 0)) {
      return res.status(400).json({ message: `At least one subject is required for ${role}.` });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    user.name = name.trim();
    user.contactMail = contactMail.trim().toLowerCase();
    user.role = role;
    user.subjects = Array.isArray(subjects) ? subjects : [];

    await user.save();
    res.json({ message: 'Member updated successfully.', user });
  } catch (err) {
    next(err);
  }
});

router.delete('/team/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    let counterDoc = await TotalMember.findOne();
    if (counterDoc) {
      const decrObj = {};

      if (user.role === 'coordinator') {
        const currentCoordCount = Number(counterDoc.Coordinator || 0);
        if (currentCoordCount > 0) decrObj.Coordinator = -1;
      } else {
        const subjects = user.subjects || [];
        if (subjects.length > 0) {
          const subjectDocs = await Subject.find({ _id: { $in: subjects } }, { _id: 1, name: 1 }).lean();
          const subjectMap = {
            physics: 'Physics',
            chemistry: 'Chemistry',
            biology: 'Biology',
            mathematics: 'Mathematics',
            math: 'Mathematics',
            maths: 'Mathematics',
          };
          const primarySubjectDoc = subjectDocs.find((s) => subjectMap[String(s.name || '').trim().toLowerCase()]);
          if (primarySubjectDoc) {
            const primarySubjectKey = subjectMap[String(primarySubjectDoc.name).trim().toLowerCase()];
            const currentSubjectCount = Number(counterDoc[primarySubjectKey] || 0);
            if (currentSubjectCount > 0) {
              decrObj[primarySubjectKey] = -1;
            }
          }
        }
      }

      const currentTeamCount = Number(counterDoc.TeamMembers || 0);
      if (currentTeamCount > 0) {
        decrObj.TeamMembers = -1;
      }

      if (Object.keys(decrObj).length > 0) {
        await TotalMember.findByIdAndUpdate(
          counterDoc._id,
          { $inc: decrObj }
        );
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Member deleted successfully and subject count updated.' });
  } catch (err) {
    next(err);
  }
});


// GET /api/auth/students - Fetch all students for admin management
router.get('/students', auth, adminOnly, async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student' }).sort({ createdAt: -1 }).lean();
    res.json(students);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/students/:id/purchases - Fetch purchases for a student
router.get('/students/:id/purchases', auth, adminOnly, async (req, res, next) => {
  try {
    const purchases = await Purchase.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    // Map and populate items manually to resolve the refPath correctly
    const testSeriesIds = purchases
      .filter((p) => p.itemType === 'TestSeries')
      .map((p) => p.itemId);
    const courseIds = purchases
      .filter((p) => p.itemType === 'Course')
      .map((p) => p.itemId);

    const [seriesDocs, courseDocs] = await Promise.all([
      testSeriesIds.length ? TestSeries.find({ _id: { $in: testSeriesIds } }).lean() : [],
      courseIds.length ? Course.find({ _id: { $in: courseIds } }).lean() : [],
    ]);

    const seriesMap = new Map(seriesDocs.map((doc) => [String(doc._id), doc]));
    const courseMap = new Map(courseDocs.map((doc) => [String(doc._id), doc]));

    const enriched = purchases.map((purchase) => {
      const itemKey = String(purchase.itemId);
      const item = purchase.itemType === 'Course'
        ? (courseMap.get(itemKey) || null)
        : (seriesMap.get(itemKey) || null);

      return {
        ...purchase,
        item: item ? { name: item.name || item.title } : { name: 'Unknown Item' }
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/enrollment-options - Fetch all courses and test series for manual enrollment selection
router.get('/enrollment-options', auth, adminOnly, async (req, res, next) => {
  try {
    const [courses, testSeries] = await Promise.all([
      Course.find().select('_id name title').lean(),
      TestSeries.find().select('_id name').lean()
    ]);
    res.json({
      courses: courses.map(c => ({ _id: c._id, name: c.name || c.title })),
      testSeries: testSeries.map(ts => ({ _id: ts._id, name: ts.name }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/students/enroll-manual - Manually enroll a student in a course or test series (marked as free purchase)
router.post('/students/enroll-manual', auth, adminOnly, async (req, res, next) => {
  try {
    const { studentId, itemType, itemId } = req.body;
    if (!studentId || !itemType || !itemId) {
      return res.status(400).json({ message: 'studentId, itemType, and itemId are required.' });
    }

    if (!['Course', 'TestSeries'].includes(itemType)) {
      return res.status(400).json({ message: 'Invalid itemType. Must be Course or TestSeries.' });
    }

    // Check if student exists
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Check if already enrolled
    const existingPurchase = await Purchase.findOne({
      user: studentId,
      itemType,
      itemId,
      status: 'success'
    });

    if (existingPurchase) {
      return res.status(400).json({ message: 'Student is already enrolled in this item.' });
    }

    // Verify item existence and get its name
    let itemName = '';
    if (itemType === 'Course') {
      const course = await Course.findById(itemId);
      if (!course) return res.status(404).json({ message: 'Course not found.' });
      itemName = course.name || course.title;
    } else {
      const series = await TestSeries.findById(itemId);
      if (!series) return res.status(404).json({ message: 'Test series not found.' });
      itemName = series.name;
    }

    // Create the Purchase record
    const purchase = new Purchase({
      user: studentId,
      itemType,
      itemId,
      amount: 0,
      method: 'free',
      status: 'success',
      razorpayOrderId: 'manual-' + Date.now(),
      razorpayPaymentId: 'manual-pay-' + Date.now(),
      meta: { manuallyAddedBy: req.user._id }
    });
    await purchase.save();

    // Cache the enrollment in the student's User document
    if (itemType === 'Course') {
      if (!student.purchasedCourses.includes(itemId)) {
        student.purchasedCourses.push(itemId);
      }
    } else {
      if (!student.purchasedSeries.includes(itemId)) {
        student.purchasedSeries.push(itemId);
      }
    }
    await student.save();

    res.json({
      message: `Successfully enrolled in ${itemName}`,
      purchase
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
