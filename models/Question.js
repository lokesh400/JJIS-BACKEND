const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  // Question image from Cloudinary
  imageUrl: {
    type: String,
    required: true,
  },
  imagePublicId: {
    type: String,
    required: true,
  },
  // Which Cloudinary account prefix this image was uploaded to (for deletion)
  cloudPrefix: {
    type: String,
    default: '',
  },
  // Question type
  type: {
    type: String,
    enum: ['mcq', 'numerical', 'msq'],
    required: true,
  },
  // For MCQ: correct option (A, B, C, or D)
  correctOption: {
    type: String,
    enum: ['A', 'B', 'C', 'D', null],
    default: null,
    required: function () {
      return this.type === 'mcq';
    },
  },
  // For MSQ (Multiple Select): one or more correct options
  correctOptions: {
    type: [{ type: String, enum: ['A', 'B', 'C', 'D'] }],
    default: [],
    validate: {
      validator: function (v) {
        if (this.type !== 'msq') return true;
        return Array.isArray(v) && v.length >= 2;
      },
      message: 'MSQ questions must have at least 2 correct options',
    },
  },
  // For Numerical: correct numerical answer
  correctNumericalAnswer: {
    type: Number,
    default: null,
    required: function () {
      return this.type === 'numerical';
    },
  },
  // Hierarchy
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    required: true,
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['unassigned', 'easy', 'medium', 'hard'],
    default: 'unassigned',
  },
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
