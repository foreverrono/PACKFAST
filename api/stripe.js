// Vercel proxy: /api/stripe?path=invoices&limit=100
// Proxies requests to Stripe API
// Env var: STRIPE_SECRET_KEY
const STRIPE_BASE = 'https://api.stripe.com/v1';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Stripe not configured' });

  const path = req.query.path || '';
  if (!path) return res.status(400).json({ error: 'Missing path' });

  // Build query string — pass all query params except 'path'
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') qs.set(k, v);
  }
  const url = `${STRIPE_BASE}/${path}${qs.toString() ? '?' + qs.toString() : ''}`;

  try {
    let body;
    const headers = {
      'Authorization': `Bearer ${key}`,
    };

    if (req.method === 'POST' && req.body) {
      // Stripe expects form-encoded POST bodies
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== null && v !== undefined) params.set(k, String(v));
      }
      body = params.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const upstream = await fetch(url, { method: req.method, headers, body });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
