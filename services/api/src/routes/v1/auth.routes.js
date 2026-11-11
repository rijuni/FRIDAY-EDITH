import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as authController from '../../controllers/auth.controller.js';

export const authRouter = Router();

const registerSchema = {
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(8, 'Password must be at least 8 characters long'),
      name: z.string().trim().min(2, 'Name must be at least 2 characters')
    })
    .strict()
};

const loginSchema = {
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(1, 'Password is required')
    })
    .strict()
};

const refreshSchema = {
  body: z
    .object({
      refreshToken: z.string().min(1).optional()
    })
    .strict()
    .optional()
};

const assignRoleSchema = {
  params: z.object({
    id: z.string().min(1)
  }),
  body: z
    .object({
      role: z.enum(['USER', 'DEVELOPER', 'ADMIN'])
    })
    .strict()
};

authRouter.post('/register', authLimiter, validate(registerSchema), authController.register);
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login);
authRouter.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.getMe);
authRouter.patch(
  '/users/:id/role',
  authenticate,
  authorize('ADMIN'),
  validate(assignRoleSchema),
  authController.assignRole
);

