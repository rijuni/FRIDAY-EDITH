const CSRF_COOKIE_NAME = 'friday_csrf_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTH_BYPASS_RETRY_PATHS = ['/v1/auth/login', '/v1/auth/register', '/v1/auth/refresh', '/v1/auth/logout'];

let activeRefreshPromise = null;

/**
 * Reads a non-HttpOnly cookie value by name from document.cookie.
 * @param {string} name
 * @returns {string | null}
 */
export function getCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return null;
}

async function refreshAuthSession() {
  if (!activeRefreshPromise) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    activeRefreshPromise = fetch('/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      }
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        activeRefreshPromise = null;
      });
  }
  return activeRefreshPromise;
}

/**
 * Shared credentialed fetch wrapper that attaches double-submit CSRF tokens
 * on state-changing requests and performs single-flight refresh retry on 401.
 * @param {string} url
 * @param {RequestInit & { skipAuthRefresh?: boolean }} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const { skipAuthRefresh = false, headers: inputHeaders = {}, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();

  const headers = new Headers(inputHeaders);
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  let response = await fetch(url, {
    ...rest,
    method,
    headers,
    credentials: 'include'
  });

  const shouldAttemptRefresh =
    response.status === 401 &&
    !skipAuthRefresh &&
    !AUTH_BYPASS_RETRY_PATHS.some((path) => url.startsWith(path));

  if (shouldAttemptRefresh) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      const retryHeaders = new Headers(headers);
      if (!SAFE_METHODS.has(method)) {
        const nextCsrf = getCookie(CSRF_COOKIE_NAME);
        if (nextCsrf) retryHeaders.set('X-CSRF-Token', nextCsrf);
      }
      response = await fetch(url, {
        ...rest,
        method,
        headers: retryHeaders,
        credentials: 'include'
      });
    }
  }

  return response;
}

/**
 * Safely parses JSON from an API response without throwing on non-JSON error pages.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

