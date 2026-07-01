require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const student = await User.findOne({ email: 'lokeshbadgujjar401@gmail.com' });
  const course = await Course.findOne({ name: 'Demo Testing Course' });

  if (student && course) {
    if (!course.purchasedBy.includes(student._id)) {
      course.purchasedBy.push(student._id);
      await course.save();
      console.log('Enrolled student in Demo Testing Course successfully!');
    } else {
      console.log('Student already enrolled.');
    }
  } else {
    console.log('Student or course not found.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
