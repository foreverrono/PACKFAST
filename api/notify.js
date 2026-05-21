// Vercel: POST /api/notify — email notifications for load status & dispatch
// Env var: RESEND_API_KEY (optional — falls back gracefully)
const TO_DISPATCH = 'dispatch@pf-canada.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const d = req.body || {};
  const apiKey = process.env.RESEND_API_KEY;

  let to, subject, html;

  if (d.type === 'dispatch') {
    // Driver dispatched — email goes to driver + dispatch
    to = [d.driver_email, TO_DISPATCH].filter(Boolean);
    subject = `PackFast Dispatch: Load ${d.load_id || d.ref || ''}`;
    html = `<h2 style="color:#e07b20">Dispatch Notice</h2>
      <p>Driver <strong>${d.driver_name || 'Driver'}</strong> has been dispatched.</p>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="color:#666;padding:4px 12px 4px 0">Load ID</td><td>${d.load_id || '—'}</td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Ref #</td><td>${d.ref || '—'}</td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Origin</td><td>${d.origin || '—'}</td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Destination</td><td>${d.dest || '—'}</td></tr>
      </table>`;
  } else if (d.type === 'status') {
    // Load status update — email goes to client
    to = [d.client_email].filter(Boolean);
    subject = `PackFast Update: Load ${d.load_id || d.ref || ''} — ${d.status || 'Status Update'}`;
    html = `<h2 style="color:#e07b20">Load Status Update</h2>
      <p>Hello ${d.client_name || 'Client'},</p>
      <p>Your load has been updated.</p>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="color:#666;padding:4px 12px 4px 0">Load ID</td><td>${d.load_id || '—'}</td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Status</td><td><strong>${d.status || '—'}</strong></td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Origin</td><td>${d.origin || '—'}</td></tr>
        <tr><td style="color:#666;padding:4px 12px 4px 0">Destination</td><td>${d.dest || '—'}</td></tr>
      </table>
      <p style="color:#999;font-size:12px">Packfast Transport Canada Inc. · dispatch@pf-canada.com</p>`;
  } else {
    return res.status(400).json({ error: 'Unknown notification type' });
  }

  if (!to || !to.length) return res.status(400).json({ error: 'No recipient email' });

  if (!apiKey) {
    // No email service — log and return success (notification silently skipped)
    console.log(`[notify] Would send "${subject}" to ${to.join(', ')}`);
    return res.json({ ok: true, note: 'RESEND_API_KEY not set — email skipped' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: 'dispatch@pf-canada.com', to, subject, html }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.message });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
