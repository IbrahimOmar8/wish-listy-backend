const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Helper function to calculate unread count with badge dismissal logic
 * @param {String} userId - User ID to calculate unread count for
 * @returns {Promise<Number>} Unread notification count
 */
const getUnreadCountWithBadge = async (userId) => {
  const user = await User.findById(userId).select('lastBadgeSeenAt');
  const query = {
    user: userId,
    isRead: false
  };
  if (user && user.lastBadgeSeenAt) {
    query.createdAt = { $gt: user.lastBadgeSeenAt };
  }
  return await Notification.countDocuments(query);
};

/**
 * Create a notification and optionally emit Socket.IO event
 * @param {Object} options - Notification options
 * @param {String} options.recipientId - User ID who receives the notification
 * @param {String|null} options.senderId - User ID who triggered the notification (null for system/private)
 * @param {String} options.type - Notification type (must be in enum)
 * @param {String} options.title - Notification title
 * @param {String} options.message - Notification message
 * @param {String|null} options.relatedId - ID of related entity (Item, Event, etc.)
 * @param {String|null} options.relatedWishlistId - ID of related Wishlist (for Item-related notifications, enables smart navigation)
 * @param {Boolean} options.emitSocketEvent - Whether to emit Socket.IO event (default: true)
 * @param {Object|null} options.socketIo - Socket.IO instance (from req.app.get('io'))
 * @returns {Promise<Object>} Created notification document
 */
async function createNotification({
  recipientId,
  senderId = null,
  type,
  title,
  message,
  relatedId = null,
  relatedWishlistId = null,
  emitSocketEvent = true,
  socketIo = null
}) {
  try {
    // Create notification in database
    const notification = await Notification.create({
      user: recipientId,        // Recipient (who gets the alert)
      relatedUser: senderId,    // Sender (who triggered it - nullable for privacy)
      type,
      title,
      message,
      relatedId,
      relatedWishlistId         // Wishlist ID for Item-related notifications (enables smart navigation)
    });

    // Populate relatedUser if senderId is provided
    if (senderId) {
      await notification.populate('relatedUser', 'fullName username profileImage');
    }

    // Emit Socket.IO event if requested and socketIo is available
    if (emitSocketEvent && socketIo) {
      try {
        // Calculate unread count with badge dismissal logic
        const unreadCount = await getUnreadCountWithBadge(recipientId);

        // Emit to recipient's room
        socketIo.to(recipientId.toString()).emit('notification', {
          notification: notification.toObject(),
          unreadCount
        });
      } catch (socketError) {
        // Log socket error but don't fail the notification creation
        console.error('Socket.IO emit error:', socketError);
      }
    }

    return notification;
  } catch (error) {
    // Log error but don't throw - notification creation failure shouldn't break main flow
    console.error('Create notification error:', error);
    throw error; // Re-throw for caller to handle if needed
  }
}

module.exports = {
  createNotification,
  getUnreadCountWithBadge
};
