'use strict';

const cloudV1 = require('./cloud');
const cloudV2 = require('./cloud-v2');

// Reuse the existing authenticated metadata handlers for both generations of keys.
async function metadata(req, key) {
  let status = 200;
  let body;
  const capture = {
    setHeader() {},
    status(code) { status = code; return this; },
    json(value) { body = value; return this; }
  };
  const request = {
    method: 'GET',
    headers: { 'x-lottery-cloud-key': key },
    query: { mode: 'meta' },
    url: '/api/cloud?mode=meta'
  };
  await (key.startsWith('LM2-') ? cloudV2 : cloudV1)(request, capture);
  if (!body) throw new Error('Metadata unavailable.');
  return { status, body };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Unsupported method.' });
  const key = req.headers['x-lottery-cloud-key'];
  if (typeof key !== 'string' || !/^LM[12]-[A-Za-z0-9_-]{43}$/.test(key)) {
    return res.status(401).json({ error: 'A valid private Cloud Sync Key is required.' });
  }
  const revision = typeof req.query.rev === 'string' ? req.query.rev : '';
  if (revision.length > 100) return res.status(400).json({ error: 'Invalid revision.' });
  let closed = false;
  const close = () => { closed = true; };
  res.on('close', close);
  const deadline = Date.now() + 20000;
  try {
    do {
      const result = await metadata(req, key);
      if (closed) return;
      if (result.status !== 200) return res.status(result.status).json({ error: result.body.error || 'Cloud unavailable.' });
      const current = result.body.manifest?.rev || '';
      if (current !== revision) return res.status(200).json({ changed: true });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (!closed && Date.now() < deadline);
    if (!closed) return res.status(200).json({ changed: false });
  } catch (error) {
    if (!closed) return res.status(503).json({ error: 'Cloud receiver temporarily unavailable.' });
  } finally {
    res.removeListener('close', close);
  }
};
