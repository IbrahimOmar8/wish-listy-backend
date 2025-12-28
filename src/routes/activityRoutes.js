const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getFriendActivities } = require('../controllers/activityController');

// All activity routes require authentication
router.use(protect);

// Get friend activities (paginated)
router.get('/', getFriendActivities);

module.exports = router;
