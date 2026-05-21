// Vercel: POST /api/verify-otp  {otp, sig, expiry}
const crypto = require('crypto');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { otp, sig, expiry } = req.body || {};
  if (!otp || !sig || !expiry) return res.status(400).json({ error: 'Missing fields' });

  if (Date.now() > Number(expiry)) return res.status(400).json({ error: 'Code expired' });

  const secret = process.env.OTP_SECRET || 'packfast-otp-secret';
  const expected = crypto.createHmac('sha256', secret).update(otp + ':' + expiry).digest('hex');

  if (expected !== sig) return res.status(401).json({ error: 'Invalid code' });

  res.json({ ok: true });
};
