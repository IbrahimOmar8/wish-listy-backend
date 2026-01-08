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

// Upload profile image (multipart/form-data)
router.post('/profile', uploadSingle('image'), uploadProfileImage);

// Upload item image (multipart/form-data)
router.post('/item/:itemId', uploadSingle('image'), uploadItemImage);

// Upload image from base64 (application/json)
router.post('/base64', uploadBase64Image);

// Delete profile image
router.delete('/profile', deleteProfileImage);

module.exports = router;
