// Vercel: GET /api/bc-trips  → returns BorderConnect manifests
//         POST /api/bc-trips {manifests:[...]} → persists manifests
// Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise in-memory
const { put, list } = require('@vercel/blob');

let _memStore = [];

async function readManifests() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return _memStore;
  try {
    const { blobs } = await list({ prefix: 'packfast/bc-manifests' });
    if (!blobs.length) return [];
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].downloadUrl);
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function writeManifests(manifests) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) { _memStore = manifests; return; }
  await put('packfast/bc-manifests.json', JSON.stringify(manifests), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const manifests = await readManifests();
    return res.json({ manifests, total: manifests.length });
  }

  if (req.method === 'POST') {
    const { manifests } = req.body || {};
    const existing = await readManifests();
    if (Array.isArray(manifests)) {
      const map = new Map(existing.map(m => [m.id, m]));
      for (const m of manifests) map.set(m.id, m);
      const merged = Array.from(map.values());
      await writeManifests(merged);
      return res.json({ ok: true, total: merged.length });
    }
    return res.json({ ok: true, total: existing.length });
  }

  res.status(405).end();
};
