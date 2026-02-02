const { uploadProfileImage: uploadToCloudinary, uploadItemImage, deleteImage } = require('../config/cloudinary');
const User = require('../models/User');
const Item = require('../models/Item');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Upload profile image
 * POST /api/upload/profile
 * Expects multipart field name: profileImage
 * Always returns valid JSON; 200 with { success: true, imageUrl } on success.
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Send the image with field name "profileImage".',
      });
    }

    // Create temporary file from buffer (Multer uses memoryStorage)
    const tempFilePath = path.join(
      os.tmpdir(),
      `profile-${Date.now()}-${req.file.originalname || 'image'}`
    );

    await fs.writeFile(tempFilePath, req.file.buffer);

    let result;
    try {
      result = await uploadToCloudinary(tempFilePath);
    } finally {
      await fs.unlink(tempFilePath).catch(() => {});
    }

    // Update user's profile image in database
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profileImage: result.url },
      { new: true }
    ).select('fullName username profileImage');

    // Always return 200 OK with valid JSON on success
    return res.status(200).json({
      success: true,
      imageUrl: result.url,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: result.url,
        user,
      },
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error.message,
    });
  }
};

/**
 * Upload item image
 * POST /api/upload/item/:itemId
 */
exports.uploadItemImage = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    // Get item and verify ownership
    const item = await Item.findById(itemId).populate('wishlist');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Check if user owns this item's wishlist
    if (item.wishlist.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to upload image for this item',
      });
    }

    // Create temporary file from buffer
    const tempFilePath = path.join(
      os.tmpdir(),
      `item-${Date.now()}-${req.file.originalname}`
    );

    await fs.writeFile(tempFilePath, req.file.buffer);

    // Upload to Cloudinary
    const result = await uploadItemImage(tempFilePath);

    // Delete temporary file
    await fs.unlink(tempFilePath).catch(() => {});

    // Update item image in database
    item.image = result.url;
    await item.save();

    return res.status(200).json({
      success: true,
      message: 'Item image uploaded successfully',
      data: {
        imageUrl: result.url,
        item: item,
      },
    });
  } catch (error) {
    console.error('Upload item image error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload item image',
      error: error.message,
    });
  }
};

/**
 * Upload image from base64 (alternative method)
 * POST /api/upload/base64
 */
exports.uploadBase64Image = async (req, res) => {
  try {
    const { image, type = 'profile' } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'No image data provided',
      });
    }

    // Validate base64 format
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Must be base64 data URI',
      });
    }

    const { uploadBase64Image } = require('../config/cloudinary');
    const folder = type === 'profile' ? 'wishlisty/profiles' : 'wishlisty/items';

    // Upload to Cloudinary
    const result = await uploadBase64Image(image, folder);

    // Update database based on type
    if (type === 'profile') {
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profileImage: result.url },
        { new: true }
      ).select('fullName username profileImage');

      return res.status(200).json({
        success: true,
        message: 'Profile image uploaded successfully',
        data: {
          imageUrl: result.url,
          user: user,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        imageUrl: result.url,
        publicId: result.publicId,
      },
    });
  } catch (error) {
    console.error('Upload base64 image error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    });
  }
};

/**
 * Delete profile image
 * DELETE /api/upload/profile
 */
exports.deleteProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.profileImage) {
      return res.status(400).json({
        success: false,
        message: 'No profile image to delete',
      });
    }

    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v123456/folder/public_id.ext
    const urlParts = user.profileImage.split('/');
    const fileWithExt = urlParts[urlParts.length - 1];
    const publicId = `wishlisty/profiles/${fileWithExt.split('.')[0]}`;

    // Delete from Cloudinary
    await deleteImage(publicId).catch(() => {
      // Ignore error if image doesn't exist in Cloudinary
    });

    // Remove from database
    user.profileImage = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile image deleted successfully',
    });
  } catch (error) {
    console.error('Delete profile image error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete profile image',
      error: error.message,
    });
  }
};
