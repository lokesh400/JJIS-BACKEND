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
    const { name, contactMail, subjects } = req.body || {};

    if (!name || !contactMail || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: 'Name, contactMail and at least one subject are required.' });
    }

    const normalizedContactMail = String(contactMail).trim().toLowerCase();
    const normalizedSubjects = subjects;

    const subjectDocs = await Subject.find({ _id: { $in: normalizedSubjects } }, { _id: 1, name: 1 }).lean();
    if (!subjectDocs.length) {
      return res.status(400).json({ message: 'Invalid subjects selected.' });
    }

    const subjectMap = {
      physics: 'Physics',
      chemistry: 'Chemistry',
      biology: 'Biology',
      mathematics: 'Mathematics',
      math: 'Mathematics',
      maths: 'Mathematics',
    };

    const primarySubjectDoc = subjectDocs.find((s) => subjectMap[String(s.name || '').trim().toLowerCase()]);
    if (!primarySubjectDoc) {
      return res.status(400).json({
        message: 'Auto-email is supported only for Physics, Chemistry, Biology, Mathematics.',
      });
    }

    const primarySubjectKey = subjectMap[String(primarySubjectDoc.name).trim().toLowerCase()];
    const primarySubjectSlug = primarySubjectKey.toLowerCase();

    let counterDoc = await TotalMember.findOne();
    if (!counterDoc) {
      counterDoc = await TotalMember.create({
        Physics: 0,
        Chemistry: 0,
        Mathematics: 0,
        Biology: 0,
      });
    }

    const updatedCounter = await TotalMember.findByIdAndUpdate(
      counterDoc._id,
      { $inc: { [primarySubjectKey]: 1 } },
      { new: true }
    ).lean();

    const subjectCount = Number(updatedCounter?.[primarySubjectKey] || 0);
    const generatedEmail = `${primarySubjectSlug}.${subjectCount}@garudclasses.com`;

    const tempPassword = normalizedContactMail;

    const user = new User({
      name: String(name).trim(),
      username: generatedEmail,
      email: generatedEmail,
      contactMail: normalizedContactMail,
      role: 'teacher',
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
      { role: { $in: ['teacher', 'admin'] } },
      { name: 1, email: 1, role: 1, mobile: 1, createdAt: 1 }
    )
      .sort({ role: 1, name: 1 })
      .lean();

    res.json(users);
  } catch (err) {
    next(err);
  }
});


module.exports = router;
