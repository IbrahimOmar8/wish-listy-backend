const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { searchUsers, getUserProfile } = require('../controllers/userController');

// Search users - requires authentication
router.get('/search', protect, searchUsers);

// Get user profile by ID - requires authentication
router.get('/:id/profile', protect, getUserProfile);

module.exports = router;
