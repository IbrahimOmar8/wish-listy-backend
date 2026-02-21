const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'friend_request',
      'friend_request_accepted',
      'event_invitation',
      'event_invitation_accepted',
      'event_invitation_maybe',
      'item_purchased',
      'item_reserved',
      'item_unreserved',
      'item_received',
      'item_not_received',
      'reservation_expired',
      'reservation_reminder',
      'event_reminder',
      'event_invite',
      'event_update',
      'event_response'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: null
  },
  messageKey: {
    type: String,
    default: null
  },
  messageVariables: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    // Can reference FriendRequest, Event, Item, etc.
  },
  relatedWishlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wishlist',
    default: null,
    // Used for Item-related notifications to enable smart navigation
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

