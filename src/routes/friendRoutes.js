const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriendSuggestions,
  getMyFriends
} = require('../controllers/friendController');

// Send friend request
router.post('/request', protect, sendFriendRequest);

// Get my friends list
router.get('/', protect, getMyFriends);

// Get incoming friend requests
router.get('/requests', protect, getFriendRequests);

// Respond to friend request (accept or reject)
router.post('/request/:id/respond', protect, respondToFriendRequest);

// Get friend suggestions (people you may know)
router.get('/suggestions', protect, getFriendSuggestions);

module.exports = router;
