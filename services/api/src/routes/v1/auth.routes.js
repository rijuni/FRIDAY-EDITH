import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as authController from '../../controllers/auth.controller.js';

export const authRouter = Router();

const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    name: z.string().min(2),
    role: z.enum(['USER', 'DEVELOPER', 'ADMIN']).optional()
  })
};

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required')
  })
};

authRouter.post('/register', authLimiter, validate(registerSchema), authController.register);
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login);
authRouter.get('/me', authenticate, authController.getMe);

