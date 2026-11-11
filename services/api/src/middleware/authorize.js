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
