const User = require('../models/User');

/**
 * Generates a unique handle from a full name
 * Format: @firstname.lastname.1234 (lowercase, slugified)
 * 
 * @param {string} fullName - The user's full name
 * @param {number} maxAttempts - Maximum number of attempts to generate unique handle (default: 100)
 * @returns {Promise<string>} A unique handle starting with @
 */
async function generateUniqueHandle(fullName, maxAttempts = 100) {
  if (!fullName || typeof fullName !== 'string') {
    throw new Error('Full name is required and must be a string');
  }

  // Step 1: Slugify the full name
  // Convert to lowercase, replace spaces and special chars with dots
  let slug = fullName
    .toLowerCase()
    .trim()
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove special characters except dots, hyphens, and underscores
    .replace(/[^a-z0-9\s._-]/g, '')
    // Replace spaces with dots
    .replace(/\s+/g, '.')
    // Remove consecutive dots
    .replace(/\.+/g, '.')
    // Remove leading/trailing dots
    .replace(/^\.+|\.+$/g, '');

  // Ensure slug is not empty
  if (!slug) {
    slug = 'user';
  }

  // Step 2: Limit slug length (reserve space for numbers and @)
  // Max handle length is 30, we reserve 5 for numbers (4 digits + @ = 5)
  const maxSlugLength = 25;
  if (slug.length > maxSlugLength) {
    // Try to preserve the structure: firstname.lastname
    const parts = slug.split('.');
    if (parts.length >= 2) {
      // Take first name and last name
      slug = parts[0] + '.' + parts[parts.length - 1];
      if (slug.length > maxSlugLength) {
        // Truncate if still too long
        slug = slug.substring(0, maxSlugLength);
      }
    } else {
      // Single word, truncate
      slug = slug.substring(0, maxSlugLength);
    }
  }

  // Step 3: Try to generate unique handle
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let handle;
    
    if (attempt === 0) {
      // First attempt: just the slug
      handle = slug;
    } else {
      // Subsequent attempts: add random 4-digit number
      const randomNum = Math.floor(1000 + Math.random() * 9000); // 1000-9999
      handle = `${slug}.${randomNum}`;
    }

    // Add @ prefix
    const handleWithAt = `@${handle}`;

    // Check if handle exists in database
    const existingUser = await User.findOne({ handle: handleWithAt });

    if (!existingUser) {
      return handleWithAt;
    }
  }

  // If we exhausted all attempts, use timestamp as fallback
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits
  return `@${slug}.${timestamp}`;
}

module.exports = {
  generateUniqueHandle
};
