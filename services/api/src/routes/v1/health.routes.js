import { Router } from 'express';
import { prisma } from '../../repositories/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    platform: 'F.R.I.D.A.Y. + E.D.I.T.H.',
    version: '2.1.0'
  });
});

healthRouter.get('/readiness', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      status: 'ready',
      subsystems: {
        api: 'up',
        database: 'up',
        auth: 'up'
      }
    });
  } catch {
    return res.status(503).json({
      status: 'not_ready',
      subsystems: {
        api: 'up',
        database: 'down',
        auth: 'degraded'
      }
    });
  }
});
