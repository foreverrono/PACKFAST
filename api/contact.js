// Vercel serverless function: POST /api/contact
// Sends freight quote requests to ahsan.ahmed@pf-canada.com via Resend
// Setup: add RESEND_API_KEY to Vercel environment variables
//   vercel env add RESEND_API_KEY production

const TO_EMAIL = 'ahsan.ahmed@pf-canada.com';
const FROM_EMAIL = 'quotes@pf-canada.com'; // must be verified in Resend dashboard

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, email, reason } = req.body || {};
  if (!name || !phone || !email || !reason) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No API key configured — return 503 so the frontend falls back to mailto
    return res.status(503).json({ error: 'Email service not configured.' });
  }

  const subject = `PackFast Quote Request from ${name}`;
  const html = `
    <h2 style="color:#e07b20">New Freight Quote Request</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;color:#666">Name</td><td style="padding:6px 0"><strong>${name}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666">Phone</td><td style="padding:6px 0"><a href="tel:${phone}">${phone}</a></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666">Email</td><td style="padding:6px 0"><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">Freight Details</td><td style="padding:6px 0;white-space:pre-wrap">${reason}</td></tr>
    </table>
    <p style="color:#999;font-size:12px;margin-top:24px">Sent from packfast.vercel.app</p>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, html, reply_to: email }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.message || 'Failed to send.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Network error.' });
  }
};
