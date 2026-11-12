/**
 * Maps a workspace filename or relative path to a Monaco Editor language identifier.
 * @param {string} [filename]
 * @returns {string}
 */
export function getMonacoLanguage(filename = '') {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) return 'javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.ps1')) return 'powershell';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.prisma')) return 'prisma';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  return 'plaintext';
}

