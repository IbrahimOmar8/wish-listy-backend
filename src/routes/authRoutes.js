const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Remove OTP routes if not implemented
// router.post('/send-otp', authController.sendOTPCode);
// router.post('/verify-otp', authController.verifyOTPAndLogin);

router.post('/register', authController.register);
router.post('/login', authController.verifyPasswordAndLogin);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);
router.delete('/delete-account', protect, authController.deleteAccount);

module.exports = router;