/**
 * Convert product URLs to affiliate links.
 * - amazon.ae, amazon.com → add tag "wishlisty-21"
 * - Other URLs → return as-is
 * @param {string|null|undefined} url - Product URL
 * @returns {string|null} Converted URL or original
 */
function convertToAffiliateLink(url) {
  if (url == null || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('amazon.ae') && !host.includes('amazon.com')) return url;
    parsed.searchParams.set('tag', 'wishlisty-21');
    return parsed.toString();
  } catch {
    return url;
  }
}

module.exports = { convertToAffiliateLink };
