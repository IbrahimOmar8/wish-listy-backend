const mongoose = require('mongoose');

const eventInvitationSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  invitee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  inviter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'maybe'],
    default: 'pending'
  },
  respondedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps
eventInvitationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index to prevent duplicate invitations
eventInvitationSchema.index({ event: 1, invitee: 1 }, { unique: true });

// Index for efficient queries
eventInvitationSchema.index({ invitee: 1, status: 1 });
eventInvitationSchema.index({ event: 1, status: 1 });

module.exports = mongoose.model('EventInvitation', eventInvitationSchema);