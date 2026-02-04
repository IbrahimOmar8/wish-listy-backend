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
const { sendPasswordResetEmail, sendRegistrationOTPEmail } = require('../utils/email');
const { uploadProfileImage, deleteImage } = require('../config/cloudinary');
const { updateFcmToken, removeFcmToken } = require('../utils/pushNotification');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Regex patterns for username validation (email/phone)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[0-9]{7,15}$/;

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
 * Change Password API
 * PATCH /api/auth/change-password
 * 
 * Allows authenticated users to change their password by providing
 * their current password and a new password.
 * 
 * Protected route - requires authentication
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Validate that current password is provided
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.current_password_required') : 'Current password is required'
      });
    }

    // Validate that new password is provided
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.new_password_required') : 'New password is required'
      });
    }

    // Validate new password length (minimum 6 characters)
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.password_required') : 'Password must be at least 6 characters long'
      });
    }

    // Get user with password field (normally excluded)
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t ? req.t('auth.user_not_found') : 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.current_password_incorrect') : 'Current password is incorrect'
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.password_same_as_current') : 'New password must be different from current password'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: req.t ? req.t('auth.password_changed_success') : 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change Password Error:', error);
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

    // Normalize username for database search (same as register function)
    // For emails: lowercase and trim
    // For phones: remove spaces, dashes, parentheses, then lowercase
    let normalizedUsername = username.trim();
    const normalizedPhoneForValidation = normalizedUsername.replace(/[\s\-()]/g, '');
    
    const isValidEmail = emailRegex.test(normalizedUsername);
    const isValidPhone = phoneRegex.test(normalizedPhoneForValidation);
    
    if (isValidEmail) {
      normalizedUsername = normalizedUsername.toLowerCase();
    } else if (isValidPhone) {
      normalizedUsername = normalizedPhoneForValidation.toLowerCase();
    } else {
      // If neither email nor phone format, still normalize (lowercase and trim)
      normalizedUsername = normalizedUsername.toLowerCase();
    }

    // Find user by normalized username
    const user = await User.findOne({ username: normalizedUsername }).select('+password');

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

    // Check if user is verified
    if (!user.isVerified) {
      const verificationMethod = user.verificationMethod || 'email';
      
      // If verification method is email, generate and send new OTP
      if (verificationMethod === 'email' && user.email) {
        try {
          // Generate new 6-digit OTP
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

          // Update user with new OTP
          await User.findByIdAndUpdate(user._id, {
            otp: otp,
            otpExpiresAt: otpExpiresAt
          });

          // Send OTP email
          await sendRegistrationOTPEmail(user.email, otp, user.fullName);
          console.log(`✅ Login OTP sent to ${user.email} for unverified user`);
        } catch (emailError) {
          console.error('Failed to send login OTP email:', emailError);
          // Continue even if email fails - user can request new OTP via verify-otp endpoint
        }
      }

      // Return response indicating verification is required (DO NOT return token)
      return res.status(401).json({
        success: false,
        message: 'You already have an unverified account',
        requiresVerification: true,
        verificationMethod: verificationMethod,
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          handle: user.handle,
          isVerified: false
        }
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
        profileImage: user.profileImage,
        isVerified: user.isVerified
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

/**
 * Verify OTP for email or phone verification
 * POST /api/auth/verify-otp
 * 
 * Verifies the OTP code sent during registration and activates the user account
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { username, otp } = req.body;

    // Validation
    if (!username || !otp) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.username_otp_required') : 'Username and OTP code are required'
      });
    }

    // Normalize username (same logic as register/login: supports email or phone)
    let normalizedUsername = username.trim();
    const normalizedPhoneForValidation = normalizedUsername.replace(/[\s\-()]/g, '');

    const isValidEmail = emailRegex.test(normalizedUsername);
    const isValidPhone = phoneRegex.test(normalizedPhoneForValidation);

    if (isValidEmail) {
      normalizedUsername = normalizedUsername.toLowerCase();
    } else if (isValidPhone) {
      normalizedUsername = normalizedPhoneForValidation.toLowerCase();
    } else {
      // Fallback: lowercase + trim
      normalizedUsername = normalizedUsername.toLowerCase();
    }

    // Find user with OTP field included using normalized username
    const user = await User.findOne({ username: normalizedUsername }).select('+otp');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t ? req.t('auth.user_not_found') : 'User not found'
      });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.already_verified') : 'Account is already verified'
      });
    }

    // Check if OTP exists
    if (!user.otp) {
      return res.status(400).json({
        success: false,
        errorCode: 'OTP_NOT_FOUND',
        message: req.t ? req.t('auth.no_otp_found') : 'No verification code found. Please request a new one.'
      });
    }

    // Check if OTP is expired
    if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        errorCode: 'OTP_EXPIRED',
        message: req.t ? req.t('auth.otp_expired') : 'Verification code has expired. Please request a new one.'
      });
    }

    // Verify OTP (string normalization: trim and compare as strings to avoid number vs string mismatch)
    const storedOtp = String(user.otp || '').trim();
    const receivedOtp = String(otp ?? '').trim();
    if (storedOtp !== receivedOtp) {
      return res.status(400).json({
        success: false,
        errorCode: 'OTP_INVALID',
        message: req.t ? req.t('auth.invalid_otp') : 'Invalid verification code'
      });
    }

    // OTP is valid - verify the user
    user.isVerified = true;
    user.otp = null; // Clear OTP after successful verification
    user.otpExpiresAt = null;
    await user.save();

    // Generate token for verified user
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: req.t ? req.t('auth.verification_success') : 'Account verified successfully!',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        handle: user.handle,
        isVerified: true
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Resend OTP API
 * POST /api/auth/resend-otp
 *
 * Sends a new verification code to an unverified user (email or phone).
 * Use cases:
 * - New user just registered: tap "Resend OTP" on verify screen.
 * - User registered, left, came back and logged in: redirect to OTP screen; login already sent new OTP; user can also tap "Resend OTP" for another code.
 * Body: { username } (email or phone, same as login/register).
 */
exports.resendOTP = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.username_required') : 'Username (email or phone) is required'
      });
    }

    // Normalize username (same logic as register / verifyOTP)
    let normalizedUsername = username.trim();
    const normalizedPhoneForValidation = normalizedUsername.replace(/[\s\-()]/g, '');
    const isValidEmail = emailRegex.test(normalizedUsername);
    const isValidPhone = phoneRegex.test(normalizedPhoneForValidation);

    if (!isValidEmail && !isValidPhone) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.username_format') : 'Username must be a valid email or phone number'
      });
    }

    if (isValidEmail) {
      normalizedUsername = normalizedUsername.toLowerCase();
    } else if (isValidPhone) {
      normalizedUsername = normalizedPhoneForValidation.toLowerCase();
    } else {
      normalizedUsername = normalizedUsername.toLowerCase();
    }

    const user = await User.findOne({ username: normalizedUsername });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t ? req.t('auth.user_not_found') : 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: req.t ? req.t('auth.already_verified') : 'Account is already verified'
      });
    }

    const verificationMethod = user.verificationMethod || 'email';

    if (verificationMethod === 'email' && (user.email || user.username)) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await User.findByIdAndUpdate(user._id, {
        otp,
        otpExpiresAt
      });

      try {
        const emailToUse = user.email || user.username;
        await sendRegistrationOTPEmail(emailToUse, otp, user.fullName);
        console.log(`✅ Resend OTP sent to ${emailToUse}`);
      } catch (emailError) {
        console.error('Resend OTP email error:', emailError);
        return res.status(500).json({
          success: false,
          message: req.t ? req.t('auth.email_send_failed') : 'Failed to send verification email. Please try again.'
        });
      }

      return res.status(200).json({
        success: true,
        message: req.t ? req.t('auth.otp_resent') : 'Verification code sent to your email.',
        verificationMethod: 'email'
      });
    }

    // Phone: backend does not send SMS (Firebase handles on frontend). Return success so client can trigger Firebase resend.
    return res.status(200).json({
      success: true,
      message: req.t ? req.t('auth.otp_resent_phone') : 'Please request a new code from the app.',
      verificationMethod: 'phone'
    });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Verify Success API
 * POST /api/auth/verify-success
 *
 * Marks user as verified after Firebase OTP verification on frontend.
 * This endpoint is called after the frontend successfully verifies OTP via Firebase.
 */
exports.verifySuccess = async (req, res) => {
  try {
    // Extract userId from request body (Flutter sends 'userId' field)
    // Also support 'id' and 'user_id' for flexibility
    const { userId, id, user_id } = req.body;
    const extractedUserId = userId || id || user_id;

    // Validation: userId is required
    if (!extractedUserId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required. Please provide userId in the request body.'
      });
    }

    // Validate userId format (must be valid ObjectId)
    if (!mongoose.Types.ObjectId.isValid(extractedUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Find user by userId
    const user = await User.findById(extractedUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is already verified
    // If already verified, return success response (frontend can handle gracefully)
    if (user.isVerified) {
      // Generate token for already verified user
      const token = generateToken(user._id);
      
      return res.status(200).json({
        success: true,
        message: 'Account is already verified',
        alreadyVerified: true,
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          handle: user.handle,
          isVerified: true
        }
      });
    }

    // Update user: set isVerified to true and clear OTP fields
    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    // Generate JWT token for verified user
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        handle: user.handle,
        isVerified: true
      }
    });
  } catch (error) {
    console.error('Verify Success Error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
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
    // Normalize username first (for phone numbers, remove spaces, dashes, parentheses)
    let normalizedUsername = username.trim();
    const normalizedPhoneForValidation = normalizedUsername.replace(/[\s\-()]/g, '');
    
    const isValidEmail = emailRegex.test(normalizedUsername);
    const isValidPhone = phoneRegex.test(normalizedPhoneForValidation);
    
    if (!isValidEmail && !isValidPhone) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.username_format')
      });
    }

    // Normalize username for database storage and searching
    // For emails: lowercase and trim
    // For phones: remove spaces, dashes, parentheses, then lowercase
    if (isValidEmail) {
      normalizedUsername = normalizedUsername.toLowerCase();
    } else if (isValidPhone) {
      // Normalize phone: remove spaces, dashes, parentheses (matching Flutter normalizePhoneNumber)
      normalizedUsername = normalizedPhoneForValidation.toLowerCase();
    }

    // Validate password
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.password_required')
      });
    }
    
    // Check if user already exists (using normalized username)
    console.log(`🔍 Searching for existing user with normalized username: ${normalizedUsername}`);
    const existingUser = await User.findOne({ username: normalizedUsername });

    // If user exists, check verification status
    if (existingUser) {
      console.log(`🔍 Existing user found:`);
      console.log(`   - ID: ${existingUser._id}`);
      console.log(`   - Username: ${existingUser.username}`);
      console.log(`   - isVerified: ${existingUser.isVerified} (type: ${typeof existingUser.isVerified})`);
      console.log(`   - isVerified === true: ${existingUser.isVerified === true}`);
      console.log(`   - !isVerified: ${!existingUser.isVerified}`);
      
      // If user is verified, reject registration
      if (existingUser.isVerified) {
        console.log(`❌ User ${existingUser._id} is already verified - rejecting registration`);
        return res.status(400).json({
          success: false,
          message: req.t('auth.username_exists')
        });
      }
      
      // If not verified, the code will CONTINUE to the re-verification logic below
      console.log(`✅ User ${existingUser._id} is not verified - proceeding with re-verification`);
    } else {
      console.log(`✅ No existing user found - proceeding with new registration`);
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

    // Detect if username is email or phone (reuse validation results from above)
    // We already have isValidEmail and isValidPhone from validation step
    const isEmail = isValidEmail;
    const isPhone = isValidPhone;
    
    // For phone, normalizedUsername is already normalized (spaces, dashes, parentheses removed)
    const normalizedPhone = isPhone ? normalizedUsername : null;

    // Handle existing unverified user (isVerified is false, null, or undefined)
    if (existingUser && !existingUser.isVerified) {
      // Update user information (fullName and password can be changed)
      existingUser.fullName = fullName.trim();
      existingUser.password = hashedPassword;
      
      // Generate unique handle if not already set
      if (!existingUser.handle) {
        try {
          existingUser.handle = await generateUniqueHandle(fullName);
          console.log(`Generated handle for existing unverified user: ${existingUser.handle}`);
        } catch (handleError) {
          console.error('Error generating handle:', handleError);
          // Continue without handle
        }
      }

      // Handle email registration for existing unverified user
      if (isEmail) {
        // Generate new 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        existingUser.email = normalizedUsername;
        existingUser.verificationMethod = 'email';
        existingUser.otp = otp;
        existingUser.otpExpiresAt = otpExpiresAt;

        // Save updated user
        await existingUser.save();

        // Send OTP email
        try {
          await sendRegistrationOTPEmail(existingUser.email, otp, existingUser.fullName);
          console.log(`✅ Registration OTP resent to ${existingUser.email}`);
        } catch (emailError) {
          console.error('Failed to send registration OTP email:', emailError);
          return res.status(500).json({
            success: false,
            message: req.t ? req.t('auth.email_send_failed') : 'Failed to send verification email. Please try again.'
          });
        }

        // Return same format as new registration
        res.status(201).json({
          success: true,
          message: req.t ? req.t('auth.registration_success_verify_email') : 'Registration successful! Please check your email for verification code.',
          requiresVerification: true,
          verificationMethod: 'email',
          user: {
            id: existingUser._id,
            fullName: existingUser.fullName,
            username: existingUser.username,
            handle: existingUser.handle,
            isVerified: false
          }
        });
        return;
      }

      // Handle phone registration for existing unverified user
      if (isPhone) {
        existingUser.phone = normalizedPhone;
        existingUser.verificationMethod = 'phone';
        // Note: Firebase will handle SMS OTP on the frontend

        // Save updated user
        await existingUser.save();

        // Return same format as new registration
        res.status(201).json({
          success: true,
          message: req.t ? req.t('auth.registration_success_verify_phone') : 'Registration successful! Please verify your phone number.',
          requiresVerification: true,
          verificationMethod: 'phone',
          user: {
            id: existingUser._id,
            fullName: existingUser.fullName,
            username: existingUser.username,
            handle: existingUser.handle,
            isVerified: false
          }
        });
        return;
      }
    }

    // Prepare user data for new registration
    const userData = {
      fullName: fullName.trim(),
      username: normalizedUsername,
      handle: generatedHandle,
      password: hashedPassword,
      isVerified: false // User must verify before accessing protected routes
    };

    // Handle email registration (new user)
    if (isEmail) {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      userData.email = normalizedUsername;
      userData.verificationMethod = 'email';
      userData.otp = otp;
      userData.otpExpiresAt = otpExpiresAt;

      // Create user first
      const user = await User.create(userData);

      // Send OTP email
      try {
        await sendRegistrationOTPEmail(user.email, otp, user.fullName);
        console.log(`✅ Registration OTP sent to ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send registration OTP email:', emailError);
        // Delete user if email sending fails
        await User.findByIdAndDelete(user._id);
        return res.status(500).json({
          success: false,
          message: req.t ? req.t('auth.email_send_failed') : 'Failed to send verification email. Please try again.'
        });
      }

      // Don't return token - user must verify OTP first
      res.status(201).json({
        success: true,
        message: req.t ? req.t('auth.registration_success_verify_email') : 'Registration successful! Please check your email for verification code.',
        requiresVerification: true,
        verificationMethod: 'email',
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          handle: user.handle,
          isVerified: false
        }
      });
      return;
    }

    // Handle phone registration (new user)
    if (isPhone) {
      userData.phone = normalizedPhone;
      userData.verificationMethod = 'phone';
      // Note: Firebase will handle SMS OTP on the frontend
      // We just mark the user as unverified

      const user = await User.create(userData);

      // Don't return token - user must verify via Firebase on frontend
      res.status(201).json({
        success: true,
        message: req.t ? req.t('auth.registration_success_verify_phone') : 'Registration successful! Please verify your phone number.',
        requiresVerification: true,
        verificationMethod: 'phone',
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          handle: user.handle,
          isVerified: false
        }
      });
      return;
    }

    // Should not reach here due to validation above, but just in case
    return res.status(400).json({
      success: false,
      message: req.t('auth.username_format')
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
    const userId = req.user.id;
    
    // Step 1: Remove FCM token to stop receiving push notifications
    await removeFcmToken(userId);

    // Step 2: Disconnect all Socket.IO connections for this user
    // This ensures complete session termination and prevents "zombie" connections
    const io = req.app.get('io');
    if (io && typeof io.disconnectUser === 'function') {
      const disconnectResult = io.disconnectUser(userId);
      if (disconnectResult.success) {
        console.log(`✅ Socket cleanup successful for user ${userId}: ${disconnectResult.disconnectedCount} socket(s) disconnected`);
      } else {
        console.warn(`⚠️ Socket cleanup warning for user ${userId}:`, disconnectResult.error);
        // Don't fail logout if socket cleanup has issues, but log it
      }
    } else {
      console.warn('⚠️ Socket.IO instance not available or disconnectUser method not found');
    }

    res.status(200).json({
      success: true,
      message: req.t('auth.logout_success')
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: req.t('auth.logout_failed'),
      error: error.message
    });
  }
};

/**
 * Update FCM Token
 * PUT /api/auth/fcm-token
 *
 * Updates the user's FCM token for push notifications.
 * Should be called when the app gets a new FCM token.
 */
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    const success = await updateFcmToken(req.user.id, fcmToken);

    if (success) {
      res.status(200).json({
        success: true,
        message: 'FCM token updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update FCM token'
      });
    }
  } catch (error) {
    console.error('Update FCM token error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Remove FCM Token
 * DELETE /api/auth/fcm-token
 *
 * Removes the user's FCM token. Call this when the user wants to disable push notifications.
 */
exports.removeFcmToken = async (req, res) => {
  try {
    const success = await removeFcmToken(req.user.id);

    if (success) {
      res.status(200).json({
        success: true,
        message: 'FCM token removed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to remove FCM token'
      });
    }
  } catch (error) {
    console.error('Remove FCM token error:', error);
    res.status(500).json({
      success: false,
      message: req.t ? req.t('common.server_error') : 'Server error'
    });
  }
};

/**
 * Service function: Cascading deletion of user account and all associated data
 * Uses MongoDB transactions to ensure atomicity
 */
const deleteUserAccount = async (userId) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    console.log(`🗑️ Starting account deletion for user: ${userId}`);
    
    // Step 0: Get user data before deletion (for profile image and phone cleanup if needed)
    const user = await User.findById(userId).select('profileImage phone').session(session);
    
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      throw new Error('User not found');
    }
    
    const profileImageUrl = user?.profileImage;
    const userPhone = user?.phone;
    
    console.log(`📋 User found: ${user._id}, Phone: ${userPhone || 'N/A'}`);

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

    // Step 13.5: Delete PasswordResetToken records for this user
    await PasswordResetToken.deleteMany({ user: userId }).session(session);

    // Step 14: Delete profile image from Cloudinary (if exists)
    if (profileImageUrl) {
      try {
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/<cloud_name>/image/upload/v123456/wishlisty/profiles/<public_id>.<ext>
        const urlParts = profileImageUrl.split('/');
        const fileWithExt = urlParts[urlParts.length - 1];
        const publicId = `wishlisty/profiles/${fileWithExt.split('.')[0]}`;

        await deleteImage(publicId).catch(() => {
          // Ignore error if image doesn't exist in Cloudinary
        });

        console.log(`🧹 Profile image deleted from Cloudinary: ${publicId}`);
      } catch (imageDeleteError) {
        console.error('Error deleting profile image from Cloudinary during account deletion:', imageDeleteError);
        // لا نفشل الترانزاكشن بسبب صورة فقط، نكمل الحذف لباقي الداتا
      }
    }

    // Step 15: Finally, delete the User record
    const deleteResult = await User.findByIdAndDelete(userId).session(session);
    
    if (!deleteResult) {
      throw new Error('Failed to delete user record');
    }
    
    console.log(`✅ User record deleted: ${userId}`);

    // Commit the transaction
    await session.commitTransaction();
    console.log(`✅ Transaction committed successfully for user: ${userId}`);
    
    // End session
    await session.endSession();

    return { success: true };
  } catch (error) {
    // Rollback the transaction on error
    console.error(`❌ Error during account deletion for user ${userId}:`, error);
    
    try {
      await session.abortTransaction();
      await session.endSession();
    } catch (sessionError) {
      console.error('Error aborting transaction:', sessionError);
    }
    
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
    let userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid authentication token'
      });
    }

    // Ensure userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Convert to ObjectId if it's a string
    userId = new mongoose.Types.ObjectId(userId);

    // Verify user exists before attempting deletion
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`🚀 Delete account request for user: ${userId} (${user.username})`);

    // Perform cascading deletion with transaction support
    const result = await deleteUserAccount(userId);
    
    if (!result || !result.success) {
      throw new Error('Account deletion failed - no result returned');
    }

    // Verify user is actually deleted (wait a bit for transaction to complete)
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for transaction
    
    const verifyDeleted = await User.findById(userId);
    if (verifyDeleted) {
      console.error(`⚠️ WARNING: User ${userId} still exists after deletion attempt!`);
      throw new Error('User deletion verification failed - user still exists');
    }

    console.log(`✅ Account deletion completed successfully for user: ${userId}`);

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
