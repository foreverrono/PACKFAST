// Vercel serverless proxy: /api/samsara
// Proxies requests to api.samsara.com to avoid browser CORS restrictions.
// Client sends: GET /api/samsara?path=/fleet/vehicles with x-samsara-key header
// This proxy forwards to: https://api.samsara.com/fleet/vehicles with Bearer auth

const SAMSARA_BASE = 'https://api.samsara.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-samsara-key, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.query.path || '';
  if (!path) return res.status(400).json({ error: 'Missing path parameter' });

  // API key from header (sent by the browser client) or env var fallback
  const apiKey =
    req.headers['x-samsara-key'] ||
    process.env.SAMSARA_API_KEY ||
    '';

  if (!apiKey) return res.status(401).json({ error: 'No Samsara API key provided' });

  // Build full Samsara URL with any query params (excluding 'path')
  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') queryParams.set(k, v);
  }
  const qs = queryParams.toString();
  const url = `${SAMSARA_BASE}${path}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await fetch(url, {
      method: req.method === 'GET' ? 'GET' : req.method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream Samsara API error', detail: err.message });
  }
};
