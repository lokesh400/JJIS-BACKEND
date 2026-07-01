const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BatchSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Batch', BatchSchema);
