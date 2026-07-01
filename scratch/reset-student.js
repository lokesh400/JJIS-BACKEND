require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const student = await User.findOne({ email: 'lokeshbadgujjar401@gmail.com' });
  if (student) {
    await student.setPassword('Badgujjar@1221');
    await student.save();
    console.log('Successfully set student password to Badgujjar@1221');
  } else {
    console.log('Student not found');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
