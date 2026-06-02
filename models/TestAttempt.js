const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // For MCQ
  selectedOption: {
    type: String,
    enum: ['A', 'B', 'C', 'D', null],
    default: null,
  },
  // For MSQ (Multiple Select Questions)
  selectedOptions: {
    type: [String],
    default: [],
  },
  // For Numerical
  numericalAnswer: {
    type: Number,
    default: null,
  },
  isCorrect: {
    type: Boolean,
    default: false,
  },
  marksObtained: {
    type: Number,
    default: 0,
  },
  // seconds spent on this question (real-time tracked from frontend)
  timeSpent: {
    type: Number,
    default: 0,
  },
}, { _id: true });

const testAttemptSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true,
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries',
    default: null,
  },
  answers: [answerSchema],
  rollNo: {
    type: String,
    sparse: true,
  },
  totalScore: {
    type: Number,
    default: 0,
  },
  maxScore: {
    type: Number,
    default: 0,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  submittedAt: {
    type: Date,
  },
  isSubmitted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Non-unique index for fast lookup by user+test
testAttemptSchema.index({ user: 1, test: 1 });

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
