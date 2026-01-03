const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriendSuggestions,
  getMyFriends,
  removeFriend,
  cancelFriendRequest,
  dismissSuggestion
} = require('../controllers/friendController');

// Send friend request
router.post('/request', protect, sendFriendRequest);

// Get my friends list
router.get('/', protect, getMyFriends);

// Get incoming friend requests
router.get('/requests', protect, getFriendRequests);

// Respond to friend request (accept or reject)
router.post('/request/:id/respond', protect, respondToFriendRequest);

// Cancel friend request (for outgoing requests - only sender can cancel)
router.delete('/request/:requestId', protect, cancelFriendRequest);

// Get friend suggestions (people you may know)
router.get('/suggestions', protect, getFriendSuggestions);

// Dismiss friend suggestion
router.post('/suggestions/dismiss', protect, dismissSuggestion);

// Remove friend (Unfriend) - Must be after specific routes like /suggestions
router.delete('/:friendId', protect, removeFriend);

module.exports = router;
