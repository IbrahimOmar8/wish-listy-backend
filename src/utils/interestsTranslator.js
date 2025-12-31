const i18next = require('i18next');

/**
 * Translates interests array based on user's preferred language
 * @param {Array<string>} interests - Array of interest keys (e.g., ['Watches', 'Gaming'])
 * @param {string} language - Language code ('en' or 'ar')
 * @returns {Array<string>} - Array of translated interest names
 */
function translateInterests(interests, language = 'en') {
  if (!Array.isArray(interests) || interests.length === 0) {
    return [];
  }

  try {
    // Get translation function for the specified language
    const t = i18next.getFixedT(language);
    
    // Translate each interest
    return interests.map(interest => {
      try {
        // Try to translate using the interest key
        const translated = t(`interests.${interest}`);
        // If translation doesn't exist, return original
        return translated !== `interests.${interest}` ? translated : interest;
      } catch (error) {
        // If translation fails, return original
        return interest;
      }
    });
  } catch (error) {
    console.error('Error translating interests:', error);
    // Return original interests if translation fails
    return interests;
  }
}

/**
 * Translates interests using req.t() from request object
 * @param {Array<string>} interests - Array of interest keys
 * @param {Function} t - Translation function from req.t()
 * @returns {Array<string>} - Array of translated interest names
 */
function translateInterestsWithT(interests, t) {
  if (!Array.isArray(interests) || interests.length === 0) {
    return [];
  }

  try {
    return interests.map(interest => {
      try {
        const translated = t(`interests.${interest}`);
        // If translation doesn't exist, return original
        return translated !== `interests.${interest}` ? translated : interest;
      } catch (error) {
        return interest;
      }
    });
  } catch (error) {
    console.error('Error translating interests:', error);
    return interests;
  }
}

module.exports = {
  translateInterests,
  translateInterestsWithT
};
