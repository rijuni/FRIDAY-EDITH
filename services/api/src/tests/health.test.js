import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';
import { validateMySqlCompatibility } from '../../scripts/validate-mysql-compat.js';

test('GET /v1/health and /v1/health/readiness verify API + database readiness', async () => {
  const server = app.listen(0, '127.0.0.1');
  const port = await new Promise((resolve) => {
    if (server.listening) return resolve(server.address().port);
    server.once('listening', () => resolve(server.address().port));
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.platform, 'F.R.I.D.A.Y. + E.D.I.T.H.');
    assert.equal(data.version, '2.1.0');

    const readyRes = await fetch(`http://127.0.0.1:${port}/v1/health/readiness`);
    assert.equal(readyRes.status, 200);
    const readyData = await readyRes.json();
    assert.equal(readyData.status, 'ready');
    assert.equal(readyData.subsystems.database, 'up');

    const compat = validateMySqlCompatibility();
    assert.equal(compat.ok, true, compat.errors.join('; '));
  } finally {
    await new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
  }
});
