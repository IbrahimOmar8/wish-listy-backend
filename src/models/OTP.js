const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: parseInt(process.env.OTP_EXPIRY_MINUTES) * 60 || 600
  }
});

module.exports = mongoose.model('OTP', otpSchema);