const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');
const FriendRequest = require('../models/FriendRequest');
const Notification = require('../models/Notification');
const Reservation = require('../models/Reservation');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const OTP = require('../models/OTP');
const PasswordResetToken = require('../models/PasswordResetToken');
const mongoose = require('mongoose');
const { generateToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');
const { generateUniqueHandle } = require('../utils/handleGenerator');
const { translateInterests } = require('../utils/interestsTranslator');
const { isValidCountryCode, isValidDateFormat, isNotFutureDate } = require('../utils/validators');
const { sendPasswordResetEmail } = require('../utils/email');
const { uploadProfileImage, deleteImage } = require('../config/cloudinary');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Request Password Reset API
 * POST /api/auth/request-reset
 *
 * Sends a 6-digit OTP code to the user's email for password reset.
 * If user provides newEmail and doesn't have one, updates their email first.
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { identifier, newEmail } = req.body;

    // Validate identifier is provided
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.identifier_required') : 'Username or phone is required'
      });
    }

    // Find user by username (which can be phone or username)
    const searchValue = identifier.toLowerCase().trim();
    const user = await User.findOne({ username: searchValue });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t ? req.t('auth.user_not_found') : 'User not found'
      });
    }

    // If user provides newEmail and doesn't have an email, update it
    let userEmail = user.email;
    if (newEmail && !user.email) {
      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(newEmail.trim())) {
        return res.status(400).json({
          success: false,
          message: req.t ? req.t('validation.invalid_email') : 'Invalid email format'
        });
      }

      // Check if email is already used by another user
      const existingEmailUser = await User.findOne({
        email: newEmail.toLowerCase().trim(),
        _id: { $ne: user._id }
      });

      if (existingEmailUser) {
        return res.status(400).json({
          success: false,
          message: req.t ? req.t('auth.email_exists') : 'Email is already in use'
        });
      }

      // Update user's email
      user.email = newEmail.toLowerCase().trim();
      await user.save();
      userEmail = user.email;
    }

    // Check if user has an email to send OTP
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.no_email') : 'No email associated with this account. Please provide an email.',
        requiresEmail: true
      });
    }

    // Generate password reset OTP
    const otp = await PasswordResetToken.createForUser(user._id, identifier);

    // Send password reset email with OTP
    try {
      await sendPasswordResetEmail(userEmail, otp, user.fullName);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      // Delete the token if email failed
      await PasswordResetToken.deleteMany({ user: user._id });
      return res.status(500).json({
        success: false,
        message: req.t ? req.t('auth.email_send_failed') : 'Failed to send reset email. Please try again.'
      });
    }

    // Mask email for response (e.g., a***@gmail.com)
    const maskedEmail = userEmail.replace(/(.{1,2})(.*)(@.*)/, (match, first, middle, domain) => {
      return first + '*'.repeat(Math.min(middle.length, 5)) + domain;
    });

    res.status(200).json({
      success: true,
      message: req.t ? req.t('auth.otp_sent') : 'Password reset code has been sent to your email',
      email: maskedEmail
    });
  } catch (error) {
    console.error('Request Password Reset Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Reset Password API
 * PATCH /api/auth/reset-password
 *
 * Verifies the OTP code and updates the user's password.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;

    // Validate inputs
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.identifier_required') : 'Username or phone is required'
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.otp_required') : 'OTP code is required'
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.password_required') : 'New password is required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.password_min_length') : 'Password must be at least 6 characters long'
      });
    }

    // Verify OTP and get associated user
    const resetToken = await PasswordResetToken.verifyOTP(identifier, otp);

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.invalid_or_expired_otp') : 'Invalid or expired OTP code'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await User.findByIdAndUpdate(resetToken.user._id, {
      password: hashedPassword
    });

    // Delete the used token (and any other tokens for this user)
    await PasswordResetToken.deleteMany({ user: resetToken.user._id });

    res.status(200).json({
      success: true,
      message: req.t ? req.t('auth.password_reset_success') : 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Check Account API
 * POST /api/auth/check-account
 * 
 * Checks if a user account exists by username (which can be email or phone).
 * Note: In this system, username field stores either email or phone,
 * similar to login/register endpoints.
 * 
 * Returns the email if the user has one in the email field, 
 * otherwise returns email_linked: false
 */
exports.checkAccount = async (req, res) => {
  try {
    const { username } = req.body;

    // Validate that username is provided
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    // Search in username field (username can be email or phone)
    // Normalize: lowercase and trim (same as login/register)
    const searchValue = username.toLowerCase().trim();
    
    // Find user by username (exact match, same as login)
    const user = await User.findOne({ 
      username: searchValue
    }).select('username email');

    // If user not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has email in the email field
    if (user.email) {
      return res.status(200).json({
        success: true,
        email: user.email
      });
    } else {
      return res.status(200).json({
        success: true,
        email_linked: false
      });
    }
  } catch (error) {
    console.error('Check Account Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

exports.verifyPasswordAndLogin = async (req, res) => {
  try {
    const { username, password, fcmToken } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_password_required')
      });
    }

    // Find user by username
    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.user_not_found')
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.invalid_password')
      });
    }

    // Update FCM token if provided (before generating token to ensure it's saved)
    if (fcmToken) {
      await User.findByIdAndUpdate(user._id, { fcmToken });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: req.t('auth.login_success'),
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Verify Password Error:', error);
    res.status(500).json({
      success: false,
      message: req.t('common.server_error')
    });
  }
};

exports.register = async (req, res) => {
  try {
    const { fullName, username, password } = req.body;

    // Validation
    if (!fullName || !username || !password) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.fullname_username_password_required')
      });
    }

    // Validate fullName
    if (typeof fullName !== 'string' || fullName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.fullname_required')
      });
    }

    // Validate username
    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_required')
      });
    }

    // Validate username format (must be a valid email or phone number)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    const isValidEmail = emailRegex.test(username);
    const isValidPhone = phoneRegex.test(username.replace(/[\s\-()]/g, ''));
    
    if (!isValidEmail && !isValidPhone) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_format')
      });
    }

    // Validate password
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.password_required')
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_exists')
      });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique handle from fullName
    let generatedHandle;
    try {
      generatedHandle = await generateUniqueHandle(fullName);
      console.log(`Generated handle for new user: ${generatedHandle}`);
    } catch (handleError) {
      console.error('Error generating handle:', handleError);
      // Continue without handle - it can be generated later via migration
      generatedHandle = null;
    }

    // Create new user
    const user = await User.create({
      fullName: fullName.trim(),
      username: username.toLowerCase().trim(),
      handle: generatedHandle,
      password: hashedPassword,
      isVerified: true
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        handle: user.handle
      }
    });
  } catch (error) {
    console.error('Register Error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_exists')
      });
    }

    res.status(500).json({
      success: false,
      message: req.t('auth.registration_failed')
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-__v -password');

    // Translate interests based on user's preferred language
    let userData = user.toObject();
    if (userData.interests && Array.isArray(userData.interests)) {
      const userLanguage = userData.preferredLanguage || 'en';
      userData.interests = translateInterests(userData.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    if (userData.birth_date) {
      const date = new Date(userData.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      userData.birth_date = `${year}-${month}-${day}`;
    }

    res.status(200).json({
      success: true,
      user: userData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.get_user_failed')
    });
  }
};

// Get current user profile (for profile edit form)
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('_id fullName username handle email phone profileImage bio gender birth_date country_code interests preferredLanguage createdAt updatedAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t('user.not_found')
      });
    }

    // Translate interests based on user's preferred language
    let userData = user.toObject();
    if (userData.interests && Array.isArray(userData.interests)) {
      const userLanguage = userData.preferredLanguage || 'en';
      userData.interests = translateInterests(userData.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    if (userData.birth_date) {
      const date = new Date(userData.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      userData.birth_date = `${year}-${month}-${day}`;
    }

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: req.t('common.server_error'),
      error: error.message
    });
  }
};

// Update current user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bio, gender, birth_date, country_code, fullName, email, phone } = req.body;

    // Build update object with only provided fields
    const updateData = {};

    // Validate and update fullName
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: req.t('auth.fullname_required')
        });
      }
      updateData.fullName = fullName.trim();
    }

    // Validate and update email
    if (email !== undefined) {
      if (email && typeof email === 'string' && email.trim().length > 0) {
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({
            success: false,
            message: req.t('validation.invalid_format')
          });
        }
        updateData.email = email.trim().toLowerCase();
      } else {
        updateData.email = null;
      }
    }

    // Validate and update phone
    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : null;
    }

    // Validate and update bio
    if (bio !== undefined) {
      if (bio && typeof bio === 'string') {
        if (bio.trim().length > 500) {
          return res.status(400).json({
            success: false,
            message: req.t('validation.max_length')
          });
        }
        updateData.bio = bio.trim() || null;
      } else {
        updateData.bio = null;
      }
    }

    // Validate and update gender
    if (gender !== undefined) {
      if (gender === null || gender === '') {
        updateData.gender = null;
      } else if (!['male', 'female'].includes(gender)) {
        return res.status(400).json({
          success: false,
          message: 'Gender must be either "male" or "female"'
        });
      } else {
        updateData.gender = gender;
      }
    }

    // Validate and update birth_date
    if (birth_date !== undefined) {
      if (birth_date === null || birth_date === '') {
        updateData.birth_date = null;
      } else {
        if (!isValidDateFormat(birth_date)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date must be in YYYY-MM-DD format'
          });
        }
        if (!isNotFutureDate(birth_date)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date cannot be in the future'
          });
        }
        // Convert YYYY-MM-DD to Date object
        updateData.birth_date = new Date(birth_date + 'T00:00:00.000Z');
      }
    }

    // Validate and update country_code
    if (country_code !== undefined) {
      if (country_code === null || country_code === '') {
        updateData.country_code = null;
      } else {
        const upperCode = typeof country_code === 'string' ? country_code.trim().toUpperCase() : country_code;
        if (!isValidCountryCode(upperCode)) {
          return res.status(400).json({
            success: false,
            message: 'Country code must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters, e.g., EG, SA, US)'
          });
        }
        updateData.country_code = upperCode;
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('_id fullName username handle email phone profileImage bio gender birth_date country_code interests preferredLanguage createdAt updatedAt');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: req.t('user.not_found')
      });
    }

    // Format response
    let userData = updatedUser.toObject();
    
    // Translate interests
    if (userData.interests && Array.isArray(userData.interests)) {
      const userLanguage = userData.preferredLanguage || 'en';
      userData.interests = translateInterests(userData.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    if (userData.birth_date) {
      const date = new Date(userData.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      userData.birth_date = `${year}-${month}-${day}`;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userData
    });
  } catch (error) {
    console.error('Update profile error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or username already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: req.t('common.server_error'),
      error: error.message
    });
  }
};

/**
 * Update Profile with Image
 * PUT /api/auth/profile/edit
 *
 * Updates profile data and optionally the profile image in a single request.
 * Accepts multipart/form-data with optional image field.
 */
exports.updateProfileWithImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bio, gender, birth_date, country_code, fullName, email, phone } = req.body;

    // Build update object with only provided fields
    const updateData = {};

    // Validate and update fullName
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: req.t ? req.t('auth.fullname_required') : 'Full name is required'
        });
      }
      updateData.fullName = fullName.trim();
    }

    // Validate and update email
    if (email !== undefined) {
      if (email && typeof email === 'string' && email.trim().length > 0) {
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({
            success: false,
            message: req.t ? req.t('validation.invalid_format') : 'Invalid email format'
          });
        }
        updateData.email = email.trim().toLowerCase();
      } else {
        updateData.email = null;
      }
    }

    // Validate and update phone
    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : null;
    }

    // Validate and update bio
    if (bio !== undefined) {
      if (bio && typeof bio === 'string') {
        if (bio.trim().length > 500) {
          return res.status(400).json({
            success: false,
            message: req.t ? req.t('validation.max_length') : 'Bio must be 500 characters or less'
          });
        }
        updateData.bio = bio.trim() || null;
      } else {
        updateData.bio = null;
      }
    }

    // Validate and update gender
    if (gender !== undefined) {
      if (gender === null || gender === '') {
        updateData.gender = null;
      } else if (!['male', 'female'].includes(gender)) {
        return res.status(400).json({
          success: false,
          message: 'Gender must be either "male" or "female"'
        });
      } else {
        updateData.gender = gender;
      }
    }

    // Validate and update birth_date
    if (birth_date !== undefined) {
      if (birth_date === null || birth_date === '') {
        updateData.birth_date = null;
      } else {
        if (!isValidDateFormat(birth_date)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date must be in YYYY-MM-DD format'
          });
        }
        if (!isNotFutureDate(birth_date)) {
          return res.status(400).json({
            success: false,
            message: 'Birth date cannot be in the future'
          });
        }
        updateData.birth_date = new Date(birth_date + 'T00:00:00.000Z');
      }
    }

    // Validate and update country_code
    if (country_code !== undefined) {
      if (country_code === null || country_code === '') {
        updateData.country_code = null;
      } else {
        const upperCode = typeof country_code === 'string' ? country_code.trim().toUpperCase() : country_code;
        if (!isValidCountryCode(upperCode)) {
          return res.status(400).json({
            success: false,
            message: 'Country code must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters, e.g., EG, SA, US)'
          });
        }
        updateData.country_code = upperCode;
      }
    }

    // Handle profile image upload if provided
    if (req.file) {
      // Get current user to check for existing image
      const currentUser = await User.findById(userId);

      // Delete old image from Cloudinary if exists
      if (currentUser && currentUser.profileImage) {
        try {
          const urlParts = currentUser.profileImage.split('/');
          const fileWithExt = urlParts[urlParts.length - 1];
          const publicId = `wishlisty/profiles/${fileWithExt.split('.')[0]}`;
          await deleteImage(publicId);
        } catch (deleteErr) {
          console.error('Failed to delete old profile image:', deleteErr);
        }
      }

      // Create temporary file from buffer
      const tempFilePath = path.join(
        os.tmpdir(),
        `profile-${Date.now()}-${req.file.originalname}`
      );

      await fs.writeFile(tempFilePath, req.file.buffer);

      // Upload to Cloudinary
      const result = await uploadProfileImage(tempFilePath);

      // Delete temporary file
      await fs.unlink(tempFilePath).catch(() => {});

      // Add image URL to update data
      updateData.profileImage = result.url;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('_id fullName username handle email phone profileImage bio gender birth_date country_code interests preferredLanguage createdAt updatedAt');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: req.t ? req.t('user.not_found') : 'User not found'
      });
    }

    // Format response
    let userData = updatedUser.toObject();

    // Translate interests
    if (userData.interests && Array.isArray(userData.interests)) {
      const userLanguage = userData.preferredLanguage || 'en';
      userData.interests = translateInterests(userData.interests, userLanguage);
    }

    // Format birth_date to YYYY-MM-DD if exists
    if (userData.birth_date) {
      const date = new Date(userData.birth_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      userData.birth_date = `${year}-${month}-${day}`;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userData
    });
  } catch (error) {
    console.error('Update profile with image error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email or username already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error',
      error: error.message
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // Since JWT is stateless, logout is primarily handled on the client side
    // by removing the token from storage. This endpoint can be used for
    // server-side logging or future token blacklisting if needed.
    res.status(200).json({
      success: true,
      message: req.t('auth.logout_success')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.logout_failed'),
      error: error.message
    });
  }
};

/**
 * Service function: Cascading deletion of user account and all associated data
 * Uses MongoDB transactions to ensure atomicity
 */
const deleteUserAccount = async (userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 0: Get user data before deletion (for profile image and phone cleanup if needed)
    const user = await User.findById(userId).select('profileImage phone').session(session);
    const profileImageUrl = user?.profileImage;
    const userPhone = user?.phone;

    // Step 1: Get user's wishlists to delete items later
    const userWishlists = await Wishlist.find({ owner: userId }).select('_id').session(session);
    const wishlistIds = userWishlists.map(w => w._id);

    // Step 2: Delete all Reservations where user is the reserver
    await Reservation.deleteMany({ reserver: userId }).session(session);

    // Step 3: Delete all Items in user's wishlists
    if (wishlistIds.length > 0) {
      await Item.deleteMany({ wishlist: { $in: wishlistIds } }).session(session);
    }

    // Step 4: Delete all Items where user is the purchaser
    await Item.updateMany(
      { purchasedBy: userId },
      { $unset: { purchasedBy: 1, purchasedAt: 1 } },
      { session }
    );

    // Step 5: Delete all Wishlists owned by the user
    await Wishlist.deleteMany({ owner: userId }).session(session);

    // Step 6: Remove user from all shared wishlists
    await Wishlist.updateMany(
      { sharedWith: userId },
      { $pull: { sharedWith: userId } },
      { session }
    );

    // Step 7: Delete all FriendRequests where user is sender or receiver
    await FriendRequest.deleteMany({
      $or: [{ from: userId }, { to: userId }]
    }).session(session);

    // Step 8: Remove user from all other users' friends arrays
    await User.updateMany(
      { friends: userId },
      { $pull: { friends: userId } },
      { session }
    );

    // Step 9: Delete all Events created by the user
    const userEvents = await Event.find({ creator: userId }).select('_id').session(session);
    const eventIds = userEvents.map(e => e._id);

    // Delete event invitations for user's events
    if (eventIds.length > 0) {
      await EventInvitation.deleteMany({ event: { $in: eventIds } }).session(session);
    }

    // Delete the events themselves
    await Event.deleteMany({ creator: userId }).session(session);

    // Step 10: Delete all EventInvitations where user is invitee or inviter
    await EventInvitation.deleteMany({
      $or: [{ invitee: userId }, { inviter: userId }]
    }).session(session);

    // Step 11: Remove user from event invited_friends arrays
    await Event.updateMany(
      { 'invited_friends.user': userId },
      { $pull: { invited_friends: { user: userId } } },
      { session }
    );

    // Step 12: Delete all Notifications where user is the recipient or related user
    await Notification.deleteMany({
      $or: [{ user: userId }, { relatedUser: userId }]
    }).session(session);

    // Step 13: Delete OTP records associated with user's phone (if any)
    // Note: OTPs auto-expire, but we clean them up for completeness
    if (userPhone) {
      await OTP.deleteMany({ phoneNumber: userPhone }).session(session);
    }

    // Step 14: Delete profile images from storage (if applicable)
    // Note: This is a placeholder. Implement actual file deletion if using
    // AWS S3, Firebase Storage, or other cloud storage services.
    // Example:
    // if (profileImageUrl) {
    //   await deleteFileFromStorage(profileImageUrl);
    // }
    // For now, profile images stored as URLs will be orphaned.
    // Implement cloud storage deletion if you're using S3/Firebase/etc.

    // Step 15: Finally, delete the User record
    await User.findByIdAndDelete(userId).session(session);

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return { success: true };
  } catch (error) {
    // Rollback the transaction on error
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * Delete Account API
 * DELETE /api/auth/delete-account
 * 
 * Permanently deletes the authenticated user's account and all associated data.
 * Uses JWT token to extract userId (prevents IDOR attacks).
 * Implements cascading deletion with database transactions for atomicity.
 */
exports.deleteAccount = async (req, res) => {
  try {
    // Security: Extract userId from JWT token (req.user.id), not from request body
    // This prevents IDOR (Insecure Direct Object Reference) attacks
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid authentication token'
      });
    }

    // Verify user exists before attempting deletion
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Perform cascading deletion with transaction support
    await deleteUserAccount(userId);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully. All associated data has been permanently removed.'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    
    // Handle transaction errors
    if (error.name === 'TransactionError' || error.message.includes('transaction')) {
      return res.status(500).json({
        success: false,
        message: 'Error deleting account. Transaction failed. Please try again.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error deleting account. Please try again later.',
      error: error.message
    });
  }
};
