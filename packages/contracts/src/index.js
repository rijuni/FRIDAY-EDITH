/**
 * @friday-edith/contracts
 * Shared API contracts and data models across Node.js API, Web, and Python AI services.
 */

export const ServiceEndpoints = {
  API_PORT: 3000,
  WEB_PORT: 5173,
  FRIDAY_AI_PORT: 8001,
  EDITH_ENGINE_PORT: 8002,
  EDITH_RUNNER_PORT: 8003
};

export const AppRoutes = {
  BOOT: '/',
  LOGIN: '/login',
  FRIDAY: '/friday',
  EDITH: '/edith'
};

export const UserRoles = {
  USER: 'USER',
  DEVELOPER: 'DEVELOPER',
  ADMIN: 'ADMIN'
};

export const PolicyDecisions = {
  SAFE: 'SAFE',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  DENIED: 'DENIED'
};

export const InternalAuthHeaders = {
  SERVICE_TOKEN: 'X-Internal-Service-Token',
  USER_ID: 'X-User-Id',
  REQUEST_ID: 'X-Request-Id'
};

export const TaskStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT'
};

export const RiskTier = {
  READ_ONLY: 'READ_ONLY',
  SAFE_EDIT: 'SAFE_EDIT',
  DESTRUCTIVE_COMMAND: 'DESTRUCTIVE_COMMAND',
  NETWORK_ACCESS: 'NETWORK_ACCESS',
  GIT_PUSH: 'GIT_PUSH'
};
