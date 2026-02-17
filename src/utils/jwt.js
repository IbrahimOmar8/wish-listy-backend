const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Set default JWT_SECRET if undefined
process.env.JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key';

// Check if JWT_SECRET is defined
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is undefined. Please check your .env file.');
  process.exit(1); // Exit if JWT_SECRET is not defined
}

/** Access token (short/medium-lived, used in Authorization header) */
exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '90d',
  });
};

/** Refresh token (long-lived, used only with POST /auth/refresh to get new access token) */
exports.generateRefreshToken = (userId) => {
  const jti = crypto.randomUUID();
  const expiresIn = process.env.JWT_REFRESH_EXPIRE || '365d';
  const token = jwt.sign(
    { id: userId, jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  const decoded = jwt.decode(token);
  const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : null;
  return { token, jti, expiresIn, expiresAt };
};

exports.verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

exports.verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
