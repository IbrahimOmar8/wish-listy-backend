const AMAZON_DOMAINS = ['amazon.ae', 'amazon.com', 'amzn.eu', 'amzn.to', 'a.co'];

function isAmazonUrl(host) {
  const h = host.toLowerCase();
  return AMAZON_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

/**
 * Convert product URLs to affiliate links.
 * - amazon.ae, amazon.com, amzn.eu, amzn.to, a.co → add tag "wishlisty-21"
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
    if (!isAmazonUrl(parsed.hostname)) return url;
    parsed.searchParams.set('tag', 'wishlisty-21');
    return parsed.toString();
  } catch {
    return url;
  }
}

module.exports = { convertToAffiliateLink };
