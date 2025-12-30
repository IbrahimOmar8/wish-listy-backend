const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');

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

    // Create new user
    const user = await User.create({
      fullName: fullName.trim(),
      username: username.toLowerCase().trim(),
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
        username: user.username
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
    const user = await User.findById(req.user.id).select('-__v');

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.get_user_failed')
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
