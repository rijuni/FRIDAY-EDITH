import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/index.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { validateOrigin } from './middleware/validateOrigin.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/v1/health.routes.js';
import { authRouter } from './routes/v1/auth.routes.js';
import { fridayRouter } from './routes/v1/friday.routes.js';
import { edithRouter } from './routes/v1/edith.routes.js';

export const app = express();

// Correlation ID & Security Middlewares
app.use(requestIdMiddleware);
app.use(helmet());
app.use(validateOrigin);
app.use(cors({
  origin: config.ALLOWED_ORIGINS.length === 1 ? config.ALLOWED_ORIGINS[0] : config.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id']
}));

// Request parsers with size limit protection
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global rate limiting
app.use('/v1', apiLimiter);

// API Routes
app.use('/v1/health', healthRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/friday', fridayRouter);
app.use('/v1/edith', edithRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    statusCode: 404,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handler
app.use(errorHandler);
