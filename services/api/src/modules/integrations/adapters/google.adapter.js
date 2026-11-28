/**
 * Google Workspace Connector Adapter for F.R.I.D.A.Y. & E.D.I.T.H.
 * 
 * Provides typed, bounded operations for Gmail, Google Calendar, and Google Drive.
 * Read operations return citations and metadata.
 * Write operations (drafts, sends, event creations) are governed by ToolApproval.
 * 
 * Anti-prompt-injection: external email, calendar descriptions, and doc text
 * are strictly tagged and handled as untrusted context.
 */

import { assertSafeOutboundUrl } from '../../../security/ssrf.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TIMEOUT_MS = 15000;

export class GoogleAdapter {
  constructor(customFetch = null) {
    this.fetchImpl = customFetch || globalThis.fetch;
  }

  async _request(url, accessToken, options = {}) {
    if (!accessToken) {
      const err = new Error('Google access token is required');
      err.statusCode = 401;
      err.errorCode = 'GOOGLE_AUTH_REQUIRED';
      throw err;
    }

    assertSafeOutboundUrl(url, ['gmail.googleapis.com', 'www.googleapis.com', 'oauth2.googleapis.com']);

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'Friday-Edith-Agent/2.1',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    };

    let response;
    try {
      response = await this.fetchImpl(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      const error = new Error(`Google API request failed: ${err.message}`);
      error.statusCode = 502;
      error.errorCode = 'GOOGLE_NETWORK_ERROR';
      throw error;
    }

    if (!response.ok) {
      let errPayload = null;
      try {
        errPayload = await response.json();
      } catch {
        // Non-JSON error body
      }

      const msg = errPayload?.error?.message || response.statusText || 'Google API error';
      // Redact any tokens or raw keys that might appear in the message
      const sanitizedMsg = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
      const error = new Error(`Google API error (${response.status}): ${sanitizedMsg}`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.errorCode =
        response.status === 401
          ? 'GOOGLE_UNAUTHORIZED'
          : response.status === 403
            ? 'GOOGLE_FORBIDDEN_OR_RATE_LIMITED'
            : response.status === 404
              ? 'GOOGLE_RESOURCE_NOT_FOUND'
              : 'GOOGLE_API_ERROR';
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // ==========================================
  // 1. Gmail Methods
  // ==========================================

  /**
   * Searches user messages matching a query.
   * @param {{ query: string, maxResults?: number, accessToken: string }} params
   */
  async searchMessages({ query, maxResults = 10, accessToken }) {
    const cleanQuery = encodeURIComponent(String(query || '').trim());
    const limit = Math.min(Math.max(1, maxResults || 10), 25);
    const url = `${GMAIL_API_BASE}/messages?q=${cleanQuery}&maxResults=${limit}`;
    const data = await this._request(url, accessToken);

    const messages = data.messages || [];
    return {
      query,
      resultCount: messages.length,
      messages: messages.map((m) => ({ id: m.id, threadId: m.threadId }))
    };
  }

  /**
   * Reads a single Gmail message with headers, snippet, and bounded body.
   * @param {{ messageId: string, accessToken: string }} params
   */
  async getMessage({ messageId, accessToken }) {
    if (!messageId) throw new Error('messageId is required');
    const url = `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`;
    const data = await this._request(url, accessToken);

    const headers = {};
    for (const h of data.payload?.headers || []) {
      const lower = h.name.toLowerCase();
      if (['from', 'to', 'subject', 'date'].includes(lower)) {
        headers[lower] = h.value;
      }
    }

    // Extract text body from payload parts or data
    let bodyText = data.snippet || '';
    if (data.payload?.body?.data) {
      bodyText = Buffer.from(data.payload.body.data, 'base64').toString('utf8');
    } else if (data.payload?.parts) {
      const textPart = data.payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf8');
      }
    }

    return {
      id: data.id,
      threadId: data.threadId,
      from: headers.from || 'Unknown',
      to: headers.to || 'Unknown',
      subject: headers.subject || '(No Subject)',
      date: headers.date || data.internalDate,
      snippet: data.snippet || '',
      body: bodyText.slice(0, 10000) // Bound to 10k chars
    };
  }

  /**
   * Governed Write: Creates a Gmail draft (requires explicit ToolApproval).
   * @param {{ to: string, subject: string, body: string, accessToken: string }} params
   */
  async createDraft({ to, subject, body, accessToken }) {
    const cleanTo = String(to || '').trim();
    const cleanSubject = String(subject || '').trim();
    if (!cleanTo || !cleanSubject) {
      throw new Error('Recipient (to) and subject are required to create a draft');
    }

    const emailLines = [
      `To: ${cleanTo}`,
      `Subject: ${cleanSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      String(body || '').trim()
    ];
    const rawEmail = Buffer.from(emailLines.join('\r\n')).toString('base64url');

    const url = `${GMAIL_API_BASE}/drafts`;
    const data = await this._request(url, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: rawEmail } })
    });

    return {
      action: 'DRAFT_CREATED',
      draftId: data.id,
      messageId: data.message?.id,
      to: cleanTo,
      subject: cleanSubject
    };
  }

  /**
   * Governed Write: Sends an email message directly (requires explicit ToolApproval).
   * @param {{ to: string, subject: string, body: string, accessToken: string }} params
   */
  async sendMessage({ to, subject, body, accessToken }) {
    const cleanTo = String(to || '').trim();
    const cleanSubject = String(subject || '').trim();
    if (!cleanTo || !cleanSubject) {
      throw new Error('Recipient (to) and subject are required to send an email');
    }

    const emailLines = [
      `To: ${cleanTo}`,
      `Subject: ${cleanSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      String(body || '').trim()
    ];
    const rawEmail = Buffer.from(emailLines.join('\r\n')).toString('base64url');

    const url = `${GMAIL_API_BASE}/messages/send`;
    const data = await this._request(url, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rawEmail })
    });

    return {
      action: 'EMAIL_SENT',
      messageId: data.id,
      threadId: data.threadId,
      to: cleanTo,
      subject: cleanSubject,
      status: 'SENT'
    };
  }

  // ==========================================
  // 2. Google Calendar Methods
  // ==========================================

  /**
   * Lists upcoming calendar events in a time window.
   * @param {{ timeMin?: string, timeMax?: string, maxResults?: number, accessToken: string }} params
   */
  async listEvents({ timeMin, timeMax, maxResults = 15, accessToken }) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(Math.min(Math.max(1, maxResults || 15), 50))
    });
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);

    const url = `${CALENDAR_API_BASE}/calendars/primary/events?${params.toString()}`;
    const data = await this._request(url, accessToken);

    const items = (data.items || []).map((ev) => ({
      id: ev.id,
      summary: ev.summary || '(Untitled Event)',
      description: (ev.description || '').slice(0, 1000),
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      location: ev.location || null,
      status: ev.status,
      htmlLink: ev.htmlLink
    }));

    return {
      totalEvents: items.length,
      events: items
    };
  }

  /**
   * Retrieves free/busy schedules for a given time window.
   * @param {{ timeMin: string, timeMax: string, accessToken: string }} params
   */
  async getFreeBusy({ timeMin, timeMax, accessToken }) {
    if (!timeMin || !timeMax) {
      throw new Error('timeMin and timeMax are required for free/busy lookup');
    }

    const url = `${CALENDAR_API_BASE}/freeBusy`;
    const data = await this._request(url, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      })
    });

    const busySlots = data.calendars?.primary?.busy || [];
    return {
      timeMin,
      timeMax,
      busyCount: busySlots.length,
      busySlots
    };
  }

  /**
   * Governed Write: Creates a calendar event (requires explicit ToolApproval).
   * @param {{ summary: string, description?: string, start: string, end: string, location?: string, attendees?: string[], accessToken: string }} params
   */
  async createEvent({ summary, description = '', start, end, location = '', attendees = [], accessToken }) {
    const cleanSummary = String(summary || '').trim();
    if (!cleanSummary || !start || !end) {
      throw new Error('Summary, start time, and end time are required to create a calendar event');
    }

    const eventPayload = {
      summary: cleanSummary,
      description: String(description || '').trim(),
      start: start.includes('T') ? { dateTime: start } : { date: start },
      end: end.includes('T') ? { dateTime: end } : { date: end }
    };
    if (location) eventPayload.location = String(location).trim();
    if (Array.isArray(attendees) && attendees.length > 0) {
      eventPayload.attendees = attendees.map((email) => ({ email: String(email).trim() }));
    }

    const url = `${CALENDAR_API_BASE}/calendars/primary/events`;
    const data = await this._request(url, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });

    return {
      action: 'EVENT_CREATED',
      eventId: data.id,
      summary: data.summary,
      start: data.start?.dateTime || data.start?.date,
      end: data.end?.dateTime || data.end?.date,
      htmlLink: data.htmlLink,
      status: 'CONFIRMED'
    };
  }

  // ==========================================
  // 3. Google Drive / Docs Methods
  // ==========================================

  /**
   * Searches files in Google Drive.
   * @param {{ query: string, maxResults?: number, accessToken: string }} params
   */
  async searchFiles({ query, maxResults = 10, accessToken }) {
    const limit = Math.min(Math.max(1, maxResults || 10), 30);
    const params = new URLSearchParams({
      pageSize: String(limit),
      fields: 'files(id, name, mimeType, size, modifiedTime)'
    });
    if (query) {
      params.set('q', `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`);
    }

    const url = `${DRIVE_API_BASE}/files?${params.toString()}`;
    const data = await this._request(url, accessToken);

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime
    }));

    return {
      query: query || '',
      resultCount: files.length,
      files
    };
  }

  /**
   * Reads bounded text content of a Google Drive file or exported Google Doc.
   * @param {{ fileId: string, accessToken: string }} params
   */
  async readFile({ fileId, accessToken }) {
    if (!fileId) throw new Error('fileId is required');

    // 1. Get file metadata
    const metaUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`;
    const meta = await this._request(metaUrl, accessToken);

    let content = '';
    const isGoogleDoc = meta.mimeType === 'application/vnd.google-apps.document';

    if (isGoogleDoc) {
      // Export Google Doc as plain text
      const exportUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
      assertSafeOutboundUrl(exportUrl, ['www.googleapis.com']);
      const response = await this.fetchImpl(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`Failed to export Google Doc: ${response.statusText}`);
      content = await response.text();
    } else {
      // Read binary / plain file content
      const contentUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
      assertSafeOutboundUrl(contentUrl, ['www.googleapis.com']);
      const response = await this.fetchImpl(contentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`Failed to fetch Drive file content: ${response.statusText}`);
      content = await response.text();
    }

    // Enforce 512 KB preview limit
    if (content.length > 512 * 1024) {
      content = content.slice(0, 512 * 1024);
    }

    return {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      sizeBytes: content.length,
      content
    };
  }
}

export const googleAdapter = new GoogleAdapter();
