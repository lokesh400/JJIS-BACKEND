const mongoose = require('mongoose');

const lecturePdfSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: true }
);

const lectureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    videoLink: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'ended',
    },
    scheduledAt: {
      type: Date,
      default: Date.now,
    },
    pdfs: {
      type: [lecturePdfSchema],
      default: [],
    },
  },
  { _id: true }
);

const chapterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    lectures: {
      type: [lectureSchema],
      default: [],
    },
  },
  { _id: true }
);

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    chapters: {
      type: [chapterSchema],
      default: [],
    },
  },
  { _id: true }
);

const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    madeFor: {
      type: String,
      enum: ['jee', 'neet', 'other'],
      default: 'other',
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    subjects: {
      type: [subjectSchema],
      default: [],
    },
    lectures: {
      type: [lectureSchema],
      default: [],
    },
    tests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Test',
      }
    ],
    purchasedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

courseSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Course', courseSchema);
