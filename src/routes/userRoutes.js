const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { searchUsers, getUserProfile, updateUserInterests } = require('../controllers/userController');
const {
  getFriendProfile,
  getFriendWishlists,
  getFriendEvents,
} = require('../controllers/friendProfileController');

// Search users - requires authentication
router.get('/search', protect, searchUsers);

// Update user interests - requires authentication (must be before parameterized routes)
router.put('/interests', protect, updateUserInterests);

// Get user profile by ID - requires authentication
router.get('/:id/profile', protect, getUserProfile);

// Friend profile endpoints - requires authentication
router.get('/:friendUserId/profile', protect, getFriendProfile);
router.get('/:friendUserId/wishlists', protect, getFriendWishlists);
router.get('/:friendUserId/events', protect, getFriendEvents);

module.exports = router;
