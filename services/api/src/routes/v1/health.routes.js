import { Router } from 'express';

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

healthRouter.get('/readiness', (req, res) => {
  res.status(200).json({
    status: 'ready',
    subsystems: {
      api: 'up',
      auth: 'up'
    }
  });
});

