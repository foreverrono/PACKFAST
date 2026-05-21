// Vercel: POST /api/send-otp  {phone: "+14381234567"}
// Returns {sig, expiry} — OTP sent via SMS (Twilio)
// Env vars: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, OTP_SECRET
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiry = Date.now() + 10 * 60 * 1000; // 10 min
  const secret = process.env.OTP_SECRET || 'packfast-otp-secret';
  const sig = crypto.createHmac('sha256', secret).update(otp + ':' + expiry).digest('hex');

  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_FROM || '+15819995020';

  if (sid && token) {
    try {
      const body = new URLSearchParams({ To: phone, From: from, Body: `PackFast TMS code: ${otp}` });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!r.ok) {
        const err = await r.json();
        return res.status(500).json({ error: err.message || 'SMS failed' });
      }
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  } else {
    // No Twilio — log OTP to console (dev mode)
    console.log(`[OTP] ${phone}: ${otp}`);
  }

  res.json({ sig, expiry });
};
