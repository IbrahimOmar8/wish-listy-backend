const Notification = require('../models/Notification');
const User = require('../models/User');

// Get all notifications for the current user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { read, limit = 50, page = 1 } = req.query;

    // Build query
    const query = { user: userId };
    
    // Filter by read status if provided
    if (read !== undefined) {
      query.isRead = read === 'true';
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .populate('relatedUser', '_id fullName username profileImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Get total count for pagination
    const total = await Notification.countDocuments(query);
    
    // Calculate unreadCount using badge dismissal logic
    const user = await User.findById(userId).select('lastBadgeSeenAt');
    const unreadQuery = {
      user: userId,
      isRead: false
    };
    if (user && user.lastBadgeSeenAt) {
      unreadQuery.createdAt = { $gt: user.lastBadgeSeenAt };
    }
    const unreadCount = await Notification.countDocuments(unreadQuery);

    res.status(200).json({
      success: true,
      count: notifications.length,
      total,
      unreadCount,
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      _id: id,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.isRead = true;
    await notification.save();

    // Calculate new unreadCount after updating (with badge dismissal logic)
    const user = await User.findById(userId).select('lastBadgeSeenAt');
    const unreadQuery = {
      user: userId,
      isRead: false
    };
    if (user && user.lastBadgeSeenAt) {
      unreadQuery.createdAt = { $gt: user.lastBadgeSeenAt };
    }
    const unreadCount = await Notification.countDocuments(unreadQuery);

    // Emit socket event for multi-device sync
    if (req.app.get('io')) {
      req.app.get('io').to(userId).emit('unread_count_update', {
        unreadCount
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification',
      error: error.message
    });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );

    // Emit socket event for multi-device sync with unreadCount = 0
    if (req.app.get('io')) {
      req.app.get('io').to(userId).emit('unread_count_update', {
        unreadCount: 0
      });
    }

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notifications',
      error: error.message
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's lastBadgeSeenAt timestamp
    const user = await User.findById(userId).select('lastBadgeSeenAt');
    
    // Build query: createdAt > lastBadgeSeenAt AND isRead == false
    const query = {
      user: userId,
      isRead: false
    };

    // If lastBadgeSeenAt exists, only count notifications created after it
    if (user && user.lastBadgeSeenAt) {
      query.createdAt = { $gt: user.lastBadgeSeenAt };
    }

    const unreadCount = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread count',
      error: error.message
    });
  }
};

// Dismiss badge (update lastBadgeSeenAt)
exports.dismissBadge = async (req, res) => {
  try {
    const userId = req.user.id;

    // Update lastBadgeSeenAt to current timestamp
    const user = await User.findByIdAndUpdate(
      userId,
      { lastBadgeSeenAt: new Date() },
      { new: true }
    ).select('lastBadgeSeenAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate new unreadCount after dismissing badge (should be 0)
    const query = {
      user: userId,
      isRead: false,
      createdAt: { $gt: user.lastBadgeSeenAt }
    };
    const unreadCount = await Notification.countDocuments(query);

    // Emit socket event for multi-device sync
    if (req.app.get('io')) {
      req.app.get('io').to(userId).emit('unread_count_update', {
        unreadCount
      });
    }

    res.status(200).json({
      success: true,
      message: 'Badge dismissed successfully',
      lastBadgeSeenAt: user.lastBadgeSeenAt,
      unreadCount
    });
  } catch (error) {
    console.error('Dismiss badge error:', error);
    res.status(500).json({
      success: false,
      message: 'Error dismissing badge',
      error: error.message
    });
  }
};

