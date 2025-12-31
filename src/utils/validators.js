/**
 * Validates ISO 3166-1 alpha-2 country code (2-letter code)
 * Common country codes: EG, SA, US, UK, AE, etc.
 * @param {string} code - Country code to validate
 * @returns {boolean} - True if valid
 */
function isValidCountryCode(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Must be exactly 2 uppercase letters
  const countryCodeRegex = /^[A-Z]{2}$/;
  if (!countryCodeRegex.test(code)) return false;

  // List of valid ISO 3166-1 alpha-2 codes (common ones)
  // For production, consider using a full library like 'iso-3166-1-alpha-2'
  const validCountryCodes = [
    'EG', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'JO', 'LB', 'IQ', 'SY', 'YE', // Middle East
    'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', // Americas
    'GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'RU', // Europe
    'CN', 'JP', 'KR', 'IN', 'AU', 'NZ', 'SG', 'MY', 'TH', 'ID', 'PH', 'VN', // Asia Pacific
    'ZA', 'NG', 'KE', 'MA', 'TN', 'DZ', // Africa
    // Add more as needed
  ];

  // For now, accept any 2-letter uppercase code
  // In production, validate against full ISO 3166-1 alpha-2 list
  return true;
}

/**
 * Validates date format (YYYY-MM-DD)
 * @param {string} dateString - Date string to validate
 * @returns {boolean} - True if valid format
 */
function isValidDateFormat(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  // Parse and validate the date
  const date = new Date(dateString + 'T00:00:00.000Z');
  if (isNaN(date.getTime())) return false;

  // Check if the parsed date matches the input (prevents invalid dates like 2024-13-01)
  const [year, month, day] = dateString.split('-').map(Number);
  return date.getUTCFullYear() === year &&
         date.getUTCMonth() + 1 === month &&
         date.getUTCDate() === day;
}

/**
 * Validates that a date is not in the future
 * @param {string} dateString - Date string to validate
 * @returns {boolean} - True if date is valid and not in the future
 */
function isNotFutureDate(dateString) {
  if (!isValidDateFormat(dateString)) return false;
  
  const date = new Date(dateString + 'T00:00:00.000Z');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return date <= today;
}

module.exports = {
  isValidCountryCode,
  isValidDateFormat,
  isNotFutureDate
};
