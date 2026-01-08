const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to the file
 * @param {string} folder - Folder name in Cloudinary (e.g., 'profiles', 'items')
 * @returns {Promise<object>} Upload result with secure_url
 */
const uploadImage = async (filePath, folder = 'wishlisty') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 800, height: 800, crop: 'limit' }, // Max size
        { quality: 'auto' }, // Auto quality optimization
        { fetch_format: 'auto' }, // Auto format (WebP for modern browsers)
      ],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image to Cloudinary');
  }
};

/**
 * Upload image from base64 string
 * @param {string} base64String - Base64 encoded image
 * @param {string} folder - Folder name
 * @returns {Promise<object>} Upload result
 */
const uploadBase64Image = async (base64String, folder = 'wishlisty') => {
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary base64 upload error:', error);
    throw new Error('Failed to upload image');
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID of the image
 * @returns {Promise<object>} Deletion result
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

/**
 * Upload profile image (optimized for avatars)
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} Upload result
 */
const uploadProfileImage = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'wishlisty/profiles',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' }, // Square crop, focus on face
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Profile image upload error:', error);
    throw new Error('Failed to upload profile image');
  }
};

/**
 * Upload item image (for wishlist items)
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} Upload result
 */
const uploadItemImage = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'wishlisty/items',
      transformation: [
        { width: 600, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Item image upload error:', error);
    throw new Error('Failed to upload item image');
  }
};

module.exports = {
  uploadImage,
  uploadBase64Image,
  deleteImage,
  uploadProfileImage,
  uploadItemImage,
  cloudinary,
};
