// Vercel proxy: /api/borderconnect?dir=send|receive
// Proxies ACE/ACI manifest submissions to BorderConnect API
// Env var: BC_API_KEY (falls back to hardcoded key)
const BC_SEND    = 'https://www.borderconnect.com/api/us/manifest/create';
const BC_RECEIVE = 'https://www.borderconnect.com/api/us/manifest/retrieve';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dir = req.query.dir || 'send';
  const apiKey = process.env.BC_API_KEY || 'a-24181-216c6ec887794f50bf2fb6c70bbf8d26';
  const url = dir === 'receive' ? BC_RECEIVE : BC_SEND;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': apiKey,
      },
      body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : '',
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/xml');
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
