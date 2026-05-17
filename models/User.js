const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose').default;

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    immutable: true,
  },
  contactMail:{
    type: String,
    lowercase: true,
    trim: true,
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
  }],
  role: {
    type: String,
    enum: ['admin', 'student','teacher'],
    default: 'student',
  },
  class: {
    type: String,
    trim: true,
  },
  targetExam: {
    type: String,
    trim: true,
  },
  mobile: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  // Quick-access list of purchased TestSeries ids.
  // Source of truth is the Purchase collection; this is a denormalised cache
  // for fast "has this user bought X?" checks without extra DB queries.
  purchasedSeries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries',
  }],
  purchasedCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
}, { timestamps: true });

// passport-local-mongoose adds hash + salt fields and register/authenticate methods.
// usernameField maps to the 'email' field; PBKDF2-SHA512 with 310 000 iterations
// (meets NIST SP 800-132 recommendations for 2024).
userSchema.plugin(passportLocalMongoose, {
  usernameField: 'email',
  iterations:    310000,
  keylen:        64,
  digestAlgorithm: 'sha512',
  errorMessages: {
    UserExistsError:        'An account with this email already exists.',
    IncorrectPasswordError: 'Invalid email or password.',
    IncorrectUsernameError: 'Invalid email or password.',
    MissingUsernameError:   'Email is required.',
    MissingPasswordError:   'Password is required.',
  },
});

module.exports = mongoose.model('User', userSchema);
