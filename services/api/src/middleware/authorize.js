/**
 * Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 * @param  {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        statusCode: 401,
        message: 'Unauthenticated'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        statusCode: 403,
        message: `Forbidden: role '${req.user.role}' is not authorized for this action`
      });
    }

    next();
  };
}

/**
 * Verifies resource ownership against the authenticated user.
 * Throws a 403 error if the caller does not own the resource.
 * @param {string} ownerId
 * @param {{ id: string, role: string }} user
 * @param {{ allowAdmin?: boolean }} [options]
 */
export function assertOwnership(ownerId, user, { allowAdmin = false } = {}) {
  if (!user?.id) {
    const err = new Error('Unauthenticated');
    err.statusCode = 401;
    throw err;
  }
  if (ownerId === user.id || (allowAdmin && user.role === 'ADMIN')) {
    return true;
  }
  const err = new Error('Forbidden: you do not own this resource');
  err.statusCode = 403;
  throw err;
}

/**
 * Express middleware wrapper for async resource ownership checks.
 * @param {(req: import('express').Request) => Promise<string|null|undefined>} resolveOwnerId
 * @param {{ allowAdmin?: boolean, notFoundMessage?: string }} [options]
 */
export function requireOwnership(resolveOwnerId, { allowAdmin = false, notFoundMessage = 'Resource not found' } = {}) {
  return async (req, res, next) => {
    try {
      const ownerId = await resolveOwnerId(req);
      if (!ownerId) {
        return res.status(404).json({
          status: 'fail',
          statusCode: 404,
          message: notFoundMessage
        });
      }
      assertOwnership(ownerId, req.user, { allowAdmin });
      next();
    } catch (error) {
      next(error);
    }
  };
}

