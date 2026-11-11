/**
 * @friday-edith/event-schemas
 * Canonical streaming and real-time event definitions (SSE & WebSockets).
 */

export const SSEEventTypes = {
  CHUNK: 'chunk',
  THINKING: 'thinking',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  CITATION: 'citation',
  APPROVAL_REQUEST: 'approval_request',
  ERROR: 'error',
  DONE: 'done'
};

export const RunnerEventTypes = {
  STDOUT: 'stdout',
  STDERR: 'stderr',
  EXIT: 'exit',
  DIFF_READY: 'diff_ready',
  STATUS: 'status'
};
