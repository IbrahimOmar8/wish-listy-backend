const User = require('../models/User');
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
    const { username, password } = req.body;

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
