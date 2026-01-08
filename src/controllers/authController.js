const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Item = require('../models/Item');
const FriendRequest = require('../models/FriendRequest');
const Notification = require('../models/Notification');
const Reservation = require('../models/Reservation');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const OTP = require('../models/OTP');
const mongoose = require('mongoose');
const { generateToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');
const { generateUniqueHandle } = require('../utils/handleGenerator');
const { translateInterests } = require('../utils/interestsTranslator');
const { isValidCountryCode, isValidDateFormat, isNotFutureDate } = require('../utils/validators');

exports.sendPasswordResetLink = async (req, res) => {
  // Logic to send password reset link (if needed)
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

    // Validate username format (alphanumeric, underscore, hyphen only)
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
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
