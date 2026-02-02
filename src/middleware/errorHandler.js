const multer = require('multer');

/**
 * Handle Multer errors (e.g. LIMIT_UNEXPECTED_FILE, LIMIT_FILE_SIZE) with clear JSON.
 * Prevents HTML or crash; ensures API always returns valid JSON for upload routes.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    const code = err.code;
    const message =
      code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Unexpected form field. Use the field name "profileImage" for profile image uploads.'
        : code === 'LIMIT_FILE_SIZE'
          ? 'File too large. Maximum size is 5MB.'
          : code === 'LIMIT_FILE_COUNT'
            ? 'Too many files.'
            : err.message;
    return res.status(400).json({
      success: false,
      message,
    });
  }

  console.error(err.stack);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;