const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getHomeData } = require('../controllers/dashboardController');

// All dashboard routes require authentication
router.use(protect);

// Get dashboard home data
router.get('/home', getHomeData);

module.exports = router;
