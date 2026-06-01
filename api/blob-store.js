// Vercel: GET /api/blob-store?key=X  → returns stored JSON
//         PUT /api/blob-store?key=X  → saves JSON body
// Requires BLOB_READ_WRITE_TOKEN (enable Vercel Blob in dashboard)
const { put, list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }

  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: `packfast/${key}` });
      if (!blobs.length) return res.json({ data: null });
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const r = await fetch(blobs[0].downloadUrl);
      const data = await r.json();
      return res.json({ data });
    } catch (e) {
      return res.json({ data: null });
    }
  }

  if (req.method === 'PUT') {
    try {
      await put(`packfast/${key}.json`, JSON.stringify(req.body), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
