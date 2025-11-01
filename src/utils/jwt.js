const jwt = require('jsonwebtoken');

// Set default JWT_SECRET if undefined
process.env.JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key';

// Check if JWT_SECRET is defined
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is undefined. Please check your .env file.');
  process.exit(1); // Exit if JWT_SECRET is not defined
}

exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
