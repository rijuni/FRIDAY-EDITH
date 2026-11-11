import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';

test('GET /v1/health returns 200 and healthy status', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/v1/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.platform, 'F.R.I.D.A.Y. + E.D.I.T.H.');
    assert.equal(data.version, '2.1.0');
  } finally {
    server.close();
  }
});

