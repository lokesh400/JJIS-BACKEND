const mongoose = require('mongoose');

const sectionQuestionSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  positiveMarks: {
    type: Number,
    default: 4,
  },
  negativeMarks: {
    type: Number,
    default: 1,
  },
}, { _id: true });

const sectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  questions: [sectionQuestionSchema],
}, { _id: true });

const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  // Syllabus / topics covered — shown to students before they start
  syllabus: {
    type: String,
    default: '',
  },
  duration: {
    type: Number, // in minutes
    required: true,
  },
  sections: [sectionSchema],
  isPublished: {
    type: Boolean,
    default: false,
  },
  // Optional date/time before which no student can start the test
  scheduledAt: {
    type: Date,
    default: null,
  },
  // 'real' → each student can submit only once; 'practice' → unlimited attempts
  mode: {
    type: String,
    enum: ['real', 'practice'],
    default: 'real',
  },
  // 'standard' → MCQ+Numerical paper; 'jee-advanced' → MCQ+Numerical+MSQ paper
  testType: {
    type: String,
    enum: ['standard', 'jee-advanced', 'dpp'],
    default: 'standard',
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    default: null,
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('Test', testSchema);
