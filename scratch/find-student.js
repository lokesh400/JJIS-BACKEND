require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI;
console.log('Connecting to:', MONGO_URI);

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  // Find a student
  const student = await User.findOne({ role: 'student' });
  if (student) {
    console.log('Found Student:', {
      id: student._id,
      email: student.email,
      name: student.name,
      batches: student.batches
    });
  } else {
    console.log('No student found in DB');
  }

  // Find a course
  const Course = require('../models/Course');
  const course = await Course.findOne();
  if (course) {
    console.log('Found Course:', {
      id: course._id,
      name: course.name,
      lectures: course.lectures.map(l => ({ id: l._id, title: l.title, status: l.status, scheduledAt: l.scheduledAt }))
    });
  } else {
    console.log('No course found in DB');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
