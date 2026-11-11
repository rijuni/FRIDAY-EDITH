import { verifyToken } from '../security/crypto.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'fail',
      statusCode: 401,
      message: 'Authentication token missing or invalid'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    if (decoded.type === 'refresh') {
      return res.status(401).json({
        status: 'fail',
        statusCode: 401,
        message: 'Invalid token type provided for authorization'
      });
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'USER',
      orgId: decoded.orgId
    };

    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      statusCode: 401,
      message: error.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid authentication token'
    });
  }
}

