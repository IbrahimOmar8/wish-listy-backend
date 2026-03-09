const axios = require('axios');

const AMAZON_DOMAINS = ['amazon.ae', 'amazon.com', 'amazon.eg', 'amzn.eu', 'amzn.to', 'a.co', 'amzn.eg'];
const SHORT_AMAZON_DOMAINS = ['amzn.eu', 'amzn.to', 'a.co', 'amzn.eg'];
const ASIN_PATTERNS = [/\/dp\/([A-Z0-9]{10})/, /\/gp\/product\/([A-Z0-9]{10})/];
const AFFILIATE_TAG = 'wishlisty-21';

function isAmazonUrl(host) {
  const h = host.toLowerCase();
  return AMAZON_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

function isShortAmazonUrl(host) {
  const h = host.toLowerCase();
  return SHORT_AMAZON_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

function extractAsin(url) {
  if (!url || typeof url !== 'string') return null;
  for (const pattern of ASIN_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractAmazonDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const amazonMatch = host.match(/^(?:www\.)?(amazon\.[a-z]{2,}(?:\.[a-z]{2})?)$/);
    return amazonMatch ? `www.${amazonMatch[1]}` : null;
  } catch {
    return null;
  }
}

function addTagToUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', AFFILIATE_TAG);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Expand short Amazon link by following redirects.
 * @param {string} url - Short URL (amzn.eu, amzn.to, a.co, amzn.eg)
 * @returns {Promise<string|null>} - Final expanded URL or null on failure
 */
async function expandShortUrl(url) {
  const opts = {
    timeout: 5000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400
  };

  try {
    const headRes = await axios.head(url, opts);
    const finalUrl = headRes.request?.res?.responseUrl || headRes.request?.responseURL || url;
    return finalUrl;
  } catch (headErr) {
    const status = headErr.response?.status;
    if (status === 405 || status === 403 || !headErr.response) {
      try {
        const getRes = await axios.get(url, {
          ...opts,
          maxContentLength: 5000
        });
        const finalUrl = getRes.request?.res?.responseUrl || getRes.request?.responseURL || url;
        return finalUrl;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Convert product URLs to affiliate links.
 * - Short links (amzn.eu, amzn.to, a.co, amzn.eg): expand, extract ASIN, build clean URL
 * - Regular Amazon URLs: extract ASIN, build clean URL or add tag
 * - Other URLs → return as-is
 * @param {string|null|undefined} url - Product URL
 * @returns {Promise<string|null>} Converted URL or original
 */
async function convertToAffiliateLink(url) {
  if (url == null || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!isAmazonUrl(parsed.hostname)) return url;

    let workingUrl = trimmed;

    if (isShortAmazonUrl(parsed.hostname)) {
      const expanded = await expandShortUrl(trimmed);
      workingUrl = expanded || trimmed;
    }

    const asin = extractAsin(workingUrl);
    if (asin) {
      const domain = extractAmazonDomain(workingUrl);
      if (domain) {
        return `https://${domain}/dp/${asin}?tag=${AFFILIATE_TAG}`;
      }
    }

    return addTagToUrl(workingUrl);
  } catch {
    return url;
  }
}

module.exports = { convertToAffiliateLink };
