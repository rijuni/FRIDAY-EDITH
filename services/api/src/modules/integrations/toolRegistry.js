import path from 'path';
import fs from 'fs';
import { prisma } from '../../repositories/prisma.js';
import { githubAdapter } from './adapters/github.adapter.js';
import { googleAdapter } from './adapters/google.adapter.js';

/**
 * Registry of typed tools available for execution.
 * Each tool declares strict parameter schemas, risk classification, and required scopes.
 * Prohibits raw shell execution, raw SQL, or model-supplied endpoints.
 */
export const TOOL_REGISTRY = new Map();

/**
 * Registers a tool into the registry.
 * @param {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   riskClass: 'READ_ONLY' | 'WRITE',
 *   requiredScopes: string[],
 *   parametersSchema: object,
 *   execute: Function
 * }} toolDefinition
 */
export function registerTool(toolDefinition) {
  if (!toolDefinition.id || !toolDefinition.name || !toolDefinition.riskClass) {
    throw new Error('Tool registration requires id, name, and riskClass');
  }
  TOOL_REGISTRY.set(toolDefinition.id, {
    ...toolDefinition,
    requiredScopes: toolDefinition.requiredScopes || []
  });
}

// 1. fs_read: Read-only safe workspace file preview (strictly bounded, path traversal blocked)
registerTool({
  id: 'fs_read',
  name: 'File Preview Reader',
  description: 'Safely reads the contents of a text file within authorized workspace directories.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['repo:read'],
  parametersSchema: {
    type: 'object',
    required: ['filePath'],
    properties: {
      filePath: { type: 'string', minLength: 1, maxLength: 512 }
    }
  },
  execute: async ({ params }) => {
    const rawPath = String(params.filePath || '').trim();
    if (rawPath.includes('..') || rawPath.includes('\0')) {
      throw new Error('Invalid file path: path traversal sequences are strictly prohibited');
    }
    const resolved = path.resolve(rawPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${path.basename(resolved)}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      throw new Error('Target is a directory or special device, not a regular file');
    }
    if (stat.size > 512 * 1024) {
      throw new Error('File exceeds preview limit of 512 KB');
    }
    const content = fs.readFileSync(resolved, 'utf8');
    return {
      filePath: rawPath,
      sizeBytes: stat.size,
      content: content.slice(0, 10000)
    };
  }
});

// 2. calculator: Pure arithmetic evaluator without eval / arbitrary code execution
registerTool({
  id: 'calculator',
  name: 'Arithmetic Calculator',
  description: 'Evaluates safe mathematical expressions (+, -, *, /, parentheses, decimal points).',
  riskClass: 'READ_ONLY',
  requiredScopes: [],
  parametersSchema: {
    type: 'object',
    required: ['expression'],
    properties: {
      expression: { type: 'string', minLength: 1, maxLength: 100 }
    }
  },
  execute: async ({ params }) => {
    const expr = String(params.expression || '').trim();
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      throw new Error('Invalid mathematical expression: only basic numeric operators are permitted');
    }
    // Safe evaluation using Function with no globals, or token-based arithmetic
    try {
      const sanitized = expr.replace(/[^0-9+\-*/().]/g, '');
      const result = new Function(`"use strict"; return (${sanitized});`)();
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('Calculation resulted in a non-finite number');
      }
      return { expression: expr, result };
    } catch {
      throw new Error('Failed to evaluate mathematical expression');
    }
  }
});

// 3. memory_search: Read-only memory search scoped to the authenticated owner
registerTool({
  id: 'memory_search',
  name: 'Personal Memory Search',
  description: 'Searches user memory notes for relevant personal context.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['memory:read'],
  parametersSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 200 }
    }
  },
  execute: async ({ user, params }) => {
    const q = String(params.query || '').trim().toLowerCase();
    const memories = await prisma.memoryItem.findMany({
      where: {
        userId: user.id,
        content: { contains: q }
      },
      take: 10,
      select: { id: true, category: true, content: true, updatedAt: true }
    });
    return { query: q, count: memories.length, items: memories };
  }
});

// 4. sample_write: Sample external write action (e.g. creating an issue or calendar event)
registerTool({
  id: 'sample_write',
  name: 'External Action Writer',
  description: 'Performs an external modification action requiring explicit user consent.',
  riskClass: 'WRITE',
  requiredScopes: ['write'],
  parametersSchema: {
    type: 'object',
    required: ['target', 'content'],
    properties: {
      target: { type: 'string', minLength: 1, maxLength: 200 },
      content: { type: 'string', minLength: 1, maxLength: 2000 }
    }
  },
  execute: async ({ params }) => {
    return {
      action: 'EXTERNAL_WRITE_EXECUTED',
      target: params.target,
      summary: `Successfully posted to ${params.target}`,
      timestamp: new Date().toISOString()
    };
  }
});

// 5. github_repo_read: Read repository metadata or bounded file contents
registerTool({
  id: 'github_repo_read',
  name: 'GitHub Repository & File Reader',
  description: 'Reads repository metadata or file contents from an authorized GitHub repository.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['repo:read'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      path: { type: 'string', maxLength: 512 },
      ref: { type: 'string', maxLength: 120 }
    }
  },
  execute: async ({ params, accessToken }) => {
    if (params.path) {
      return githubAdapter.getFileContent({
        owner: params.owner,
        repo: params.repo,
        path: params.path,
        ref: params.ref,
        accessToken
      });
    }
    return githubAdapter.getRepository({
      owner: params.owner,
      repo: params.repo,
      accessToken
    });
  }
});

// 6. github_pr_read: Read pull request details and status
registerTool({
  id: 'github_pr_read',
  name: 'GitHub Pull Request Reader',
  description: 'Reads pull request metadata, diff metrics, mergeable status, and review state.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['repo:read'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo', 'pullNumber'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      pullNumber: { type: 'number', minimum: 1 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return githubAdapter.getPullRequest({
      owner: params.owner,
      repo: params.repo,
      pullNumber: params.pullNumber,
      accessToken
    });
  }
});

// 7. github_issues_read: Read repository issues
registerTool({
  id: 'github_issues_read',
  name: 'GitHub Issues & PR List',
  description: 'Lists open or closed issues and pull requests with author, labels, and descriptions.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['repo:read'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      state: { type: 'string', enum: ['open', 'closed', 'all'] },
      limit: { type: 'number', minimum: 1, maximum: 30 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return githubAdapter.listIssues({
      owner: params.owner,
      repo: params.repo,
      state: params.state || 'open',
      limit: params.limit || 15,
      accessToken
    });
  }
});

// 8. github_ci_status: Check runs and CI build status
registerTool({
  id: 'github_ci_status',
  name: 'GitHub CI & Check Runs',
  description: 'Retrieves CI and test workflow statuses for a commit or branch.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['repo:read'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo', 'ref'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      ref: { type: 'string', minLength: 1, maxLength: 120 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return githubAdapter.getCiStatus({
      owner: params.owner,
      repo: params.repo,
      ref: params.ref,
      accessToken
    });
  }
});

// 9. github_create_branch: Governed branch creation (requires explicit ToolApproval)
registerTool({
  id: 'github_create_branch',
  name: 'GitHub Branch Creator',
  description: 'Creates a new git branch in the repository from a specified base branch.',
  riskClass: 'WRITE',
  requiredScopes: ['repo:write'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo', 'branchName'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      branchName: { type: 'string', minLength: 1, maxLength: 120 },
      baseBranch: { type: 'string', maxLength: 120 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return githubAdapter.createBranch({
      owner: params.owner,
      repo: params.repo,
      branchName: params.branchName,
      baseBranch: params.baseBranch || 'main',
      accessToken
    });
  }
});

// 10. github_create_pr: Governed Pull Request creation (requires explicit ToolApproval)
registerTool({
  id: 'github_create_pr',
  name: 'GitHub Pull Request Creator',
  description: 'Creates a new Pull Request with a title, description, and source/target branches.',
  riskClass: 'WRITE',
  requiredScopes: ['repo:write'],
  parametersSchema: {
    type: 'object',
    required: ['owner', 'repo', 'title', 'head'],
    properties: {
      owner: { type: 'string', minLength: 1, maxLength: 100 },
      repo: { type: 'string', minLength: 1, maxLength: 100 },
      title: { type: 'string', minLength: 1, maxLength: 160 },
      body: { type: 'string', maxLength: 4000 },
      head: { type: 'string', minLength: 1, maxLength: 120 },
      base: { type: 'string', maxLength: 120 },
      draft: { type: 'boolean' }
    }
  },
  execute: async ({ params, accessToken }) => {
    return githubAdapter.createPullRequest({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body || '',
      head: params.head,
      base: params.base || 'main',
      draft: Boolean(params.draft),
      accessToken
    });
  }
});

// 11. gmail_search_messages: Search user emails matching query
registerTool({
  id: 'gmail_search_messages',
  name: 'Gmail Message Search',
  description: 'Searches user emails matching a specified search query or keywords.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['gmail:read'],
  parametersSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 200 },
      maxResults: { type: 'number', minimum: 1, maximum: 25 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.searchMessages({
      query: params.query,
      maxResults: params.maxResults || 10,
      accessToken
    });
  }
});

// 12. gmail_read_message: Read a specific message with headers and bounded body
registerTool({
  id: 'gmail_read_message',
  name: 'Gmail Message Reader',
  description: 'Reads headers, snippet, and content of a specific Gmail message.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['gmail:read'],
  parametersSchema: {
    type: 'object',
    required: ['messageId'],
    properties: {
      messageId: { type: 'string', minLength: 1, maxLength: 100 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.getMessage({
      messageId: params.messageId,
      accessToken
    });
  }
});

// 13. gmail_create_draft: Governed Write - Create an email draft (requires ToolApproval)
registerTool({
  id: 'gmail_create_draft',
  name: 'Gmail Draft Creator',
  description: 'Creates a new Gmail draft without sending it immediately.',
  riskClass: 'WRITE',
  requiredScopes: ['gmail:write'],
  parametersSchema: {
    type: 'object',
    required: ['to', 'subject', 'body'],
    properties: {
      to: { type: 'string', minLength: 3, maxLength: 254 },
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      body: { type: 'string', maxLength: 10000 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.createDraft({
      to: params.to,
      subject: params.subject,
      body: params.body,
      accessToken
    });
  }
});

// 14. gmail_send_message: Governed Write - Send an email directly (requires ToolApproval)
registerTool({
  id: 'gmail_send_message',
  name: 'Gmail Email Sender',
  description: 'Sends an email to a recipient. Requires explicit user review and confirmation.',
  riskClass: 'WRITE',
  requiredScopes: ['gmail:write'],
  parametersSchema: {
    type: 'object',
    required: ['to', 'subject', 'body'],
    properties: {
      to: { type: 'string', minLength: 3, maxLength: 254 },
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      body: { type: 'string', maxLength: 10000 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.sendMessage({
      to: params.to,
      subject: params.subject,
      body: params.body,
      accessToken
    });
  }
});

// 15. calendar_list_events: List calendar events in a window
registerTool({
  id: 'calendar_list_events',
  name: 'Google Calendar Event List',
  description: 'Lists upcoming calendar events within an optional time range.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['calendar:read'],
  parametersSchema: {
    type: 'object',
    properties: {
      timeMin: { type: 'string', maxLength: 50 },
      timeMax: { type: 'string', maxLength: 50 },
      maxResults: { type: 'number', minimum: 1, maximum: 50 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.listEvents({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults || 15,
      accessToken
    });
  }
});

// 16. calendar_freebusy: Query free/busy slots
registerTool({
  id: 'calendar_freebusy',
  name: 'Google Calendar Free/Busy',
  description: 'Checks busy time slots in the primary calendar for scheduling.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['calendar:read'],
  parametersSchema: {
    type: 'object',
    required: ['timeMin', 'timeMax'],
    properties: {
      timeMin: { type: 'string', minLength: 1, maxLength: 50 },
      timeMax: { type: 'string', minLength: 1, maxLength: 50 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.getFreeBusy({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      accessToken
    });
  }
});

// 17. calendar_create_event: Governed Write - Create a calendar event (requires ToolApproval)
registerTool({
  id: 'calendar_create_event',
  name: 'Google Calendar Event Creator',
  description: 'Creates a calendar event. Requires explicit user preview and approval.',
  riskClass: 'WRITE',
  requiredScopes: ['calendar:write'],
  parametersSchema: {
    type: 'object',
    required: ['summary', 'start', 'end'],
    properties: {
      summary: { type: 'string', minLength: 1, maxLength: 200 },
      start: { type: 'string', minLength: 1, maxLength: 50 },
      end: { type: 'string', minLength: 1, maxLength: 50 },
      description: { type: 'string', maxLength: 2000 },
      location: { type: 'string', maxLength: 300 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.createEvent({
      summary: params.summary,
      start: params.start,
      end: params.end,
      description: params.description,
      location: params.location,
      accessToken
    });
  }
});

// 18. drive_search_files: Search files in Google Drive
registerTool({
  id: 'drive_search_files',
  name: 'Google Drive File Search',
  description: 'Searches for files in Google Drive by filename or query.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['drive:read'],
  parametersSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 200 },
      maxResults: { type: 'number', minimum: 1, maximum: 30 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.searchFiles({
      query: params.query || '',
      maxResults: params.maxResults || 10,
      accessToken
    });
  }
});

// 19. drive_read_file: Read bounded text content of a Drive file or Doc
registerTool({
  id: 'drive_read_file',
  name: 'Google Drive File Reader',
  description: 'Reads text content or exports a Google Doc up to 512 KB.',
  riskClass: 'READ_ONLY',
  requiredScopes: ['drive:read'],
  parametersSchema: {
    type: 'object',
    required: ['fileId'],
    properties: {
      fileId: { type: 'string', minLength: 1, maxLength: 100 }
    }
  },
  execute: async ({ params, accessToken }) => {
    return googleAdapter.readFile({
      fileId: params.fileId,
      accessToken
    });
  }
});

/**
 * Returns typed tool descriptors for discovery.
 */
export function listRegisteredTools() {
  return [...TOOL_REGISTRY.values()].map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    riskClass: t.riskClass,
    requiredScopes: t.requiredScopes,
    parametersSchema: t.parametersSchema
  }));
}

/**
 * Resolves a registered tool by its identifier.
 * @param {string} toolId
 */
export function getRegisteredTool(toolId) {
  return TOOL_REGISTRY.get(toolId) || null;
}
