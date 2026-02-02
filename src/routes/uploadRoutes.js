const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  uploadProfileImage,
  uploadItemImage,
  uploadBase64Image,
  deleteProfileImage,
} = require('../controllers/uploadController');

// All routes require authentication
router.use(protect);

// Profile image: POST for initial upload, PUT for editing (field name 'profileImage' for both)
router.post('/profile', uploadSingle('profileImage'), uploadProfileImage);
router.put('/profile', uploadSingle('profileImage'), uploadProfileImage);

// Upload item image (multipart/form-data)
router.post('/item/:itemId', uploadSingle('image'), uploadItemImage);

// Upload image from base64 (application/json)
router.post('/base64', uploadBase64Image);

// Delete profile image
router.delete('/profile', deleteProfileImage);

module.exports = router;
