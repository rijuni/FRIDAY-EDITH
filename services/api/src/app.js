import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/v1/health.routes.js';
import { authRouter } from './routes/v1/auth.routes.js';

export const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));

// Request parsers with size limit protection
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global rate limiting
app.use('/v1', apiLimiter);

// API Routes
app.use('/v1/health', healthRouter);
app.use('/v1/auth', authRouter);

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
