// Vercel: POST /api/notify — dispatch & status emails via SMTP (Zoho Mail)
// Env vars (set in Vercel → Settings → Environment Variables):
//   SMTP_HOST  e.g. smtp.zoho.com
//   SMTP_USER  the mailbox login, e.g. dispatch@pf-canada.com
//   SMTP_PASS  a Zoho App Password (Zoho Mail → Settings → Security → App Passwords)
//   SMTP_PORT  optional, default 465 (SSL). Use 587 for STARTTLS.
//   SMTP_FROM  optional, default "PackFast Dispatch <SMTP_USER>"
const nodemailer = require('nodemailer');
const TO_DISPATCH = 'dispatch@pf-canada.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const row = (label, val) =>
  `<tr><td style="color:#666;padding:4px 12px 4px 0">${label}</td><td>${esc(val) || '—'}</td></tr>`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const d = req.body || {};
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const from = process.env.SMTP_FROM || `PackFast Dispatch <${user || TO_DISPATCH}>`;

  let to, subject, html;

  if (d.type === 'dispatch') {
    // Driver dispatched — email goes to driver + dispatch mailbox
    to = [d.driver_email, TO_DISPATCH].filter(Boolean);
    subject = `PackFast Dispatch: Load ${d.load_id || d.ref || ''}`;
    const stops = Array.isArray(d.stops) ? d.stops : [];
    const stopsHtml = stops.length
      ? `<h3 style="color:#e07b20;font-size:14px;margin:16px 0 6px">Stops</h3>` +
        stops.map((s, i) => {
          const isP = s.type === 'P';
          return `<div style="border-left:3px solid ${isP ? '#4caf50' : '#f44336'};padding:4px 10px;margin:6px 0">
            <strong>${i + 1} · ${isP ? 'Pickup' : 'Delivery'}</strong> — ${esc(s.location || s.name || '')}<br>
            <span style="color:#666;font-size:13px">${esc(s.address || '')}${s.date ? ' · ' + esc(s.date) : ''}${s.appointment ? ' · ' + esc(s.appointment) : ''}</span>
          </div>`;
        }).join('')
      : '';
    html = `<h2 style="color:#e07b20">Dispatch Notice</h2>
      <p>Driver <strong>${esc(d.driver_name) || 'Driver'}</strong> has been dispatched.</p>
      <table style="font-size:14px;border-collapse:collapse">
        ${row('Load ID', d.load_id)}
        ${row('Ref #', d.ref)}
        ${row('Origin', d.origin)}
        ${row('Destination', d.dest)}
        ${d.truck ? row('Truck / Unit', d.truck) : ''}
        ${d.trailer ? row('Trailer #', d.trailer) : ''}
        ${d.commodity ? row('Commodity', d.commodity) : ''}
        ${d.weight ? row('Weight', d.weight) : ''}
        ${d.pickup_date ? row('Pickup Date', d.pickup_date) : ''}
        ${d.delivery_date ? row('Delivery Date', d.delivery_date) : ''}
      </table>
      ${stopsHtml}
      ${d.notes ? `<p style="margin-top:14px;white-space:pre-wrap">${esc(d.notes)}</p>` : ''}
      <p style="color:#999;font-size:12px;margin-top:18px">Packfast Transport Canada Inc. · dispatch@pf-canada.com</p>`;
  } else if (d.type === 'status') {
    // Load status update — email goes to client
    to = [d.client_email].filter(Boolean);
    subject = `PackFast Update: Load ${d.load_id || d.ref || ''} — ${d.status || 'Status Update'}`;
    html = `<h2 style="color:#e07b20">Load Status Update</h2>
      <p>Hello ${esc(d.client_name) || 'Client'},</p>
      <p>Your load has been updated.</p>
      <table style="font-size:14px;border-collapse:collapse">
        ${row('Load ID', d.load_id)}
        ${row('Status', d.status)}
        ${row('Origin', d.origin)}
        ${row('Destination', d.dest)}
      </table>
      <p style="color:#999;font-size:12px">Packfast Transport Canada Inc. · dispatch@pf-canada.com</p>`;
  } else {
    return res.status(400).json({ error: 'Unknown notification type' });
  }

  if (!to || !to.length) return res.status(400).json({ error: 'No recipient email' });

  if (!host || !user || !pass) {
    return res.status(500).json({ error: 'Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Vercel' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, html });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
