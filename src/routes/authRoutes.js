const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

// Remove OTP routes if not implemented
// router.post('/send-otp', authController.sendOTPCode);
// router.post('/verify-otp', authController.verifyOTPAndLogin);

router.post('/register', authController.register);
router.post('/login', authController.verifyPasswordAndLogin);
router.post('/check-account', authController.checkAccount);
router.post('/request-reset', authController.requestPasswordReset);
router.patch('/reset-password', authController.resetPassword);
router.patch('/change-password', protect, authController.changePassword);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);
router.put('/profile/edit', protect, uploadSingle('image'), authController.updateProfileWithImage);
router.delete('/delete-account', protect, authController.deleteAccount);

module.exports = router;