const mongoose = require('mongoose');

const TotalMember = new mongoose.Schema({
  
    Physics:{
        type:Number
    },
    Chemistry:{
        type:Number,
    },
    Mathematics:{
        type:Number,
    },
    Biology:{
        type:Number,
    }

}, { timestamps: true });

module.exports = mongoose.model('TotalMember', TotalMember);
