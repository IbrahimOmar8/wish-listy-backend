const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    // Skip authentication for OPTIONS requests (preflight)
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is verified
    // Note: verify-otp endpoint is not protected, so this check only applies to protected routes
    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not verified. Please verify your email or phone number to access this feature.',
        requiresVerification: true,
        verificationMethod: req.user.verificationMethod || 'email'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};
