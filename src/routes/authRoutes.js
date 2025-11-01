const express = require('express');
const router = express.Router();
const { sendOTPCode, verifyOTPAndLogin, register, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/send-otp', sendOTPCode);
router.post('/verify-otp', verifyOTPAndLogin);
router.post('/register', register);
router.get('/me', protect, getMe);

module.exports = router;