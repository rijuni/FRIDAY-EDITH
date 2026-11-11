import rateLimit from 'express-rate-limit';

// Standard rate limiter for general API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Stricter rate limiter for sensitive authentication endpoints (prevent brute-forcing)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 failed login/register attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    message: 'Too many authentication attempts, please try again in 15 minutes.'
  }
});

