const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { searchUsers, getUserProfile, updateUserProfile, updateUserInterests } = require('../controllers/userController');
const {
  getBlockedUsers,
  blockUser,
  unblockUser,
  reportUser,
} = require('../controllers/userActionsController');
const {
  getFriendProfile,
  getFriendWishlists,
  getFriendEvents,
} = require('../controllers/friendProfileController');

// Search users - requires authentication
router.get('/search', protect, searchUsers);

// Update user interests - requires authentication (must be before parameterized routes)
router.put('/interests', protect, updateUserInterests);

// Block and report (must be before /:id routes)
router.get('/blocked', protect, getBlockedUsers);
router.post('/block/:id', protect, blockUser);
router.post('/unblock/:id', protect, unblockUser);
router.post('/report/:id', protect, reportUser);

// Get user profile by ID - requires authentication
router.get('/:id/profile', protect, getUserProfile);
// Update user profile by ID - requires authentication (user can only update their own profile)
// PATCH for partial updates (frontend uses this)
router.patch('/:id/profile', protect, updateUserProfile);

// Friend profile endpoints - requires authentication
router.get('/:friendUserId/profile', protect, getFriendProfile);
router.get('/:friendUserId/wishlists', protect, getFriendWishlists);
router.get('/:friendUserId/events', protect, getFriendEvents);

module.exports = router;
