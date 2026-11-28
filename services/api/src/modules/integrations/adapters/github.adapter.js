/**
 * GitHub Connector Adapter for F.R.I.D.A.Y. + E.D.I.T.H.
 * 
 * Provides typed, bounded operations for GitHub repository inspection,
 * issue/PR reading, CI status checks, and governed branch/PR creations.
 * 
 * Anti-prompt-injection: all returned file, commit, issue, and PR content
 * is classified as untrusted external reference data.
 */

import { assertSafeOutboundUrl } from '../../../security/ssrf.js';

const GITHUB_API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 15000;

export class GitHubAdapter {
  constructor(customFetch = null) {
    this.fetchImpl = customFetch || globalThis.fetch;
  }

  async _request(endpoint, accessToken, options = {}) {
    if (!accessToken) {
      const err = new Error('GitHub access token is required');
      err.statusCode = 401;
      err.errorCode = 'GITHUB_AUTH_REQUIRED';
      throw err;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
    assertSafeOutboundUrl(url, ['api.github.com']);
    const headers = {
      Accept: 'application/vnd.github.v3+json',
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
      const error = new Error(`GitHub API request failed: ${err.message}`);
      error.statusCode = 502;
      error.errorCode = 'GITHUB_NETWORK_ERROR';
      throw error;
    }

    if (!response.ok) {
      let errPayload = null;
      try {
        errPayload = await response.json();
      } catch {
        // Non-JSON error body
      }

      const msg = errPayload?.message || response.statusText || 'GitHub API error';
      const error = new Error(`GitHub error (${response.status}): ${msg}`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.errorCode =
        response.status === 401
          ? 'GITHUB_UNAUTHORIZED'
          : response.status === 403
            ? 'GITHUB_FORBIDDEN_OR_RATE_LIMITED'
            : response.status === 404
              ? 'GITHUB_RESOURCE_NOT_FOUND'
              : 'GITHUB_API_ERROR';
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // 1. Read repository metadata
  async getRepository({ owner, repo, accessToken }) {
    const data = await this._request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, accessToken);
    return {
      id: data.id,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      visibility: data.visibility || (data.private ? 'private' : 'public'),
      openIssuesCount: data.open_issues_count,
      stargazersCount: data.stargazers_count,
      updatedAt: data.updated_at
    };
  }

  // 2. Read pull request metadata & diff summary
  async getPullRequest({ owner, repo, pullNumber, accessToken }) {
    const pr = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(pullNumber)}`,
      accessToken
    );
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state,
      isDraft: Boolean(pr.draft),
      baseBranch: pr.base?.ref,
      headBranch: pr.head?.ref,
      author: pr.user?.login,
      merged: pr.merged || false,
      mergeable: pr.mergeable,
      commentsCount: pr.comments,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at
    };
  }

  // 3. List recent issues or pull requests
  async listIssues({ owner, repo, state = 'open', limit = 15, accessToken }) {
    const query = new URLSearchParams({ state, per_page: String(Math.min(limit, 30)) });
    const items = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query.toString()}`,
      accessToken
    );
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      body: (item.body || '').slice(0, 1000), // Bounded excerpt
      state: item.state,
      isPullRequest: Boolean(item.pull_request),
      labels: (item.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
      author: item.user?.login,
      commentsCount: item.comments,
      createdAt: item.created_at
    }));
  }

  // 4. Read CI / Check runs status for a commit or branch
  async getCiStatus({ owner, repo, ref, accessToken }) {
    const data = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/check-runs`,
      accessToken
    );
    const runs = (data.check_runs || []).map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion, // success, failure, neutral, cancelled, timed_out, action_required
      startedAt: run.started_at,
      completedAt: run.completed_at,
      htmlUrl: run.html_url
    }));

    const isSuccess = runs.length > 0 && runs.every((r) => r.conclusion === 'success');
    const isPending = runs.some((r) => r.status !== 'completed');

    return {
      ref,
      totalRuns: runs.length,
      overallState: isPending ? 'PENDING' : isSuccess ? 'SUCCESS' : 'FAILURE',
      checkRuns: runs
    };
  }

  // 5. Read bounded file content from repository (Max 512 KB)
  async getFileContent({ owner, repo, path: filePath, ref, accessToken }) {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const cleanPath = filePath.replace(/^\/+/, '');
    const data = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(cleanPath)}${query}`,
      accessToken
    );

    if (data.type !== 'file') {
      throw new Error(`Target path '${cleanPath}' is a ${data.type}, not a file`);
    }

    if (data.size > 512 * 1024) {
      throw new Error(`File '${cleanPath}' exceeds 512 KB preview limit (${data.size} bytes)`);
    }

    let textContent = '';
    if (data.encoding === 'base64' && data.content) {
      textContent = Buffer.from(data.content, 'base64').toString('utf8');
    }

    return {
      path: data.path,
      name: data.name,
      sha: data.sha,
      sizeBytes: data.size,
      content: textContent
    };
  }

  // 6. Governed Write: Create a branch (requires explicit ToolApproval)
  async createBranch({ owner, repo, branchName, baseBranch = 'main', accessToken }) {
    // 1. Get base branch SHA
    const baseRef = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
      accessToken
    );
    const sha = baseRef.object?.sha;
    if (!sha) {
      throw new Error(`Base branch '${baseBranch}' commit SHA could not be resolved`);
    }

    // 2. Create new reference
    const cleanBranch = branchName.replace(/^refs\/heads\//, '');
    const newRef = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${cleanBranch}`,
          sha
        })
      }
    );

    return {
      action: 'BRANCH_CREATED',
      repository: `${owner}/${repo}`,
      branch: cleanBranch,
      baseBranch,
      sha: newRef.object?.sha
    };
  }

  // 7. Governed Write: Create a Pull Request (requires explicit ToolApproval)
  // No force push or auto-merge permitted!
  async createPullRequest({ owner, repo, title, body, head, base = 'main', draft = false, accessToken }) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      throw new Error('Pull request title cannot be empty');
    }

    const pr = await this._request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          body: String(body || '').trim(),
          head,
          base,
          draft: Boolean(draft)
        })
      }
    );

    return {
      action: 'PULL_REQUEST_CREATED',
      repository: `${owner}/${repo}`,
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      head: pr.head?.ref,
      base: pr.base?.ref,
      isDraft: Boolean(pr.draft),
      createdAt: pr.created_at
    };
  }
}

export const githubAdapter = new GitHubAdapter();
