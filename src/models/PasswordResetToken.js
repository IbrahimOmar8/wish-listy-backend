const mongoose = require('mongoose');

const passwordResetTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  identifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// TTL index - automatically delete expired tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster lookup
passwordResetTokenSchema.index({ identifier: 1, otp: 1 });

// Static method to generate a 6-digit OTP
passwordResetTokenSchema.statics.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Static method to create a reset OTP for a user
passwordResetTokenSchema.statics.createForUser = async function(userId, identifier) {
  // Delete any existing tokens for this user
  await this.deleteMany({ user: userId });

  // Generate new OTP
  const otp = this.generateOTP();

  // Create and save the token document
  const resetToken = await this.create({
    user: userId,
    otp: otp,
    identifier: identifier.toLowerCase().trim(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  });

  return resetToken.otp;
};

// Static method to verify OTP and get user
passwordResetTokenSchema.statics.verifyOTP = async function(identifier, otp) {
  const resetToken = await this.findOne({
    identifier: identifier.toLowerCase().trim(),
    otp: otp,
    expiresAt: { $gt: new Date() }
  }).populate('user');

  return resetToken;
};

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
