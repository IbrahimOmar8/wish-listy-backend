const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  dismissBadge
} = require('../controllers/notificationController');

// Get all notifications (supports filtering by read status, pagination)
router.get('/', protect, getNotifications);

// Get unread count
router.get('/unread-count', protect, getUnreadCount);

// Mark notification as read
router.patch('/:id/read', protect, markAsRead);

// Mark all notifications as read
router.patch('/read-all', protect, markAllAsRead);

// Dismiss badge (update lastBadgeSeenAt)
router.patch('/dismiss-badge', protect, dismissBadge);

// Delete notification
router.delete('/:id', protect, deleteNotification);

module.exports = router;

