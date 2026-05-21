// Vercel: GET /api/bc-trips  → returns saved BorderConnect manifests
//         POST /api/bc-trips {manifests:[...]} → persists manifests
// Uses in-memory store (resets on cold start) — upgrade to KV for persistence
let store = { manifests: [] };

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({ manifests: store.manifests, total: store.manifests.length });
  }

  if (req.method === 'POST') {
    const { manifests } = req.body || {};
    if (Array.isArray(manifests)) {
      // Merge by id — don't duplicate
      const existing = new Map(store.manifests.map(m => [m.id, m]));
      for (const m of manifests) {
        existing.set(m.id, m);
      }
      store.manifests = Array.from(existing.values());
    }
    return res.json({ ok: true, total: store.manifests.length });
  }

  res.status(405).end();
};
