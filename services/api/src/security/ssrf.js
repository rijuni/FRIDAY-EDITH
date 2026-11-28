/**
 * SSRF (Server-Side Request Forgery) Outbound Guard
 * 
 * Strict protection against outbound SSRF attacks by inspecting destination URLs,
 * resolving/checking IP addresses, rejecting private networks (RFC 1918),
 * loopback, link-local (cloud metadata endpoints 169.254.169.254), and enforce
 * domain allowlists for integration adapters and external AI providers.
 */

import net from 'net';

// Allowed default domains for integrations and external AI providers
export const ALLOWED_EXTERNAL_DOMAINS = Object.freeze([
  // GitHub API
  'api.github.com',
  'github.com',
  // Google Workspace & OAuth
  'gmail.googleapis.com',
  'www.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
  // AI Provider APIs
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com'
]);

// Private and sensitive IP ranges to block
const BLOCKED_IP_PATTERNS = [
  /^127\./,                          // 127.0.0.0/8 (IPv4 Loopback)
  /^0\./,                            // 0.0.0.0/8 (Current network)
  /^10\./,                           // 10.0.0.0/8 (RFC 1918 Private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12 (RFC 1918 Private)
  /^192\.168\./,                     // 192.168.0.0/16 (RFC 1918 Private)
  /^169\.254\./,                     // 169.254.0.0/16 (Link-local, AWS/GCP/Azure metadata)
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (Carrier-grade NAT)
  /^192\.0\.2\./,                    // TEST-NET-1
  /^198\.51\.100\./,                 // TEST-NET-2
  /^203\.0\.113\./,                  // TEST-NET-3
  /^224\./,                          // Multicast
  /^240\./                           // Reserved / Future use
];

/**
 * Checks if a hostname or IP address is considered private, loopback, or blocked.
 * @param {string} host 
 * @returns {boolean}
 */
export function isPrivateOrBlockedHost(host) {
  if (!host || typeof host !== 'string') return true;

  const normalizedHost = host.trim().toLowerCase();

  // Explicit hostnames to block
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === 'localhost.localdomain' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.local') ||
    normalizedHost.endsWith('.internal')
  ) {
    return true;
  }

  // IPv6 checks
  if (normalizedHost === '::1' || normalizedHost === '[::1]' || normalizedHost === '::') {
    return true;
  }
  // IPv6 link-local (fe80::/10) or unique local (fc00::/7)
  const cleanV6 = normalizedHost.replace(/^\[|\]$/g, '');
  if (cleanV6.startsWith('fe80:') || cleanV6.startsWith('fc') || cleanV6.startsWith('fd')) {
    return true;
  }

  // If host is an IPv4 address, check against blocked patterns
  if (net.isIPv4(normalizedHost)) {
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(normalizedHost)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates that an outbound URL is safe and optionally conforms to an allowlist of domains.
 * @param {string} rawUrl 
 * @param {string[]|null} [allowedDomains=null] 
 * @returns {URL} Parsed and validated URL
 * @throws {Error} With statusCode: 403, errorCode: 'SSRF_BLOCKED'
 */
export function validateOutboundUrl(rawUrl, allowedDomains = null) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    const error = new Error('Outbound URL must be a valid non-empty string');
    error.statusCode = 400;
    error.errorCode = 'INVALID_URL';
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const error = new Error(`Malformed outbound URL: ${rawUrl}`);
    error.statusCode = 400;
    error.errorCode = 'INVALID_URL';
    throw error;
  }

  // Only allow HTTP and HTTPS protocols
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    const error = new Error(`Unsupported protocol '${parsed.protocol}' for outbound request`);
    error.statusCode = 403;
    error.errorCode = 'SSRF_BLOCKED';
    throw error;
  }

  // In production, force HTTPS for external communication
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    const error = new Error(`Insecure protocol 'http:' blocked in production; https: is required`);
    error.statusCode = 403;
    error.errorCode = 'SSRF_BLOCKED';
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private IPs, loopbacks, and cloud metadata addresses
  if (isPrivateOrBlockedHost(hostname)) {
    const error = new Error(`Outbound request to private/blocked host '${hostname}' is prohibited`);
    error.statusCode = 403;
    error.errorCode = 'SSRF_BLOCKED';
    throw error;
  }

  // If allowedDomains list is provided, enforce strict matching
  if (Array.isArray(allowedDomains) && allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some((allowed) => {
      const normalizedAllowed = allowed.toLowerCase();
      return hostname === normalizedAllowed || hostname.endsWith(`.${normalizedAllowed}`);
    });

    if (!isAllowed) {
      const error = new Error(`Outbound host '${hostname}' is not in the allowed domain list`);
      error.statusCode = 403;
      error.errorCode = 'SSRF_BLOCKED';
      throw error;
    }
  }

  return parsed;
}

/**
 * Convenience assertion helper that throws if URL fails SSRF safety.
 * @param {string} rawUrl 
 * @param {string[]|null} [allowedDomains=null] 
 */
export function assertSafeOutboundUrl(rawUrl, allowedDomains = null) {
  validateOutboundUrl(rawUrl, allowedDomains);
}

/**
 * SSRF-guarded fetch wrapper.
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @param {string[]|null} [allowedDomains=null] 
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, options = {}, allowedDomains = null) {
  assertSafeOutboundUrl(url, allowedDomains);
  return globalThis.fetch(url, options);
}
