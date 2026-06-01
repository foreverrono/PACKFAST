// Vercel: GET /api/blob-store?key=X  → returns { data: <stored JSON | null> }
//         PUT /api/blob-store?key=X  → saves JSON body, returns { ok: true }
//
// Backed by a PRIVATE Vercel Blob store. Requires @vercel/blob >= 2.3 and
// BLOB_READ_WRITE_TOKEN (or OIDC when the store is connected to the project).
// Private stores need access:'private' on both put() and get(); the older
// list()+fetch(downloadUrl) read path does not work because the blob URL is
// not publicly fetchable.
const { put, get } = require('@vercel/blob');

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
  const pathname = `packfast/${key}.json`;

  if (req.method === 'GET') {
    try {
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return res.json({ data: null });
      }
      const text = await new Response(result.stream).text();
      return res.json({ data: JSON.parse(text) });
    } catch (e) {
      // No blob yet (404) or transient error — treat as empty so the client
      // keeps its in-memory/seed data instead of throwing.
      return res.json({ data: null });
    }
  }

  if (req.method === 'PUT') {
    try {
      await put(pathname, JSON.stringify(req.body), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        // This blob is mutable app state, overwritten constantly. The default
        // CDN cache is 1 month, which would serve stale data on reload — so
        // disable it and always read fresh from origin.
        cacheControlMaxAge: 0,
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
};
