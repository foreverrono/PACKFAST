// Vercel: POST /api/tts  {text, voice}
// Proxies to OpenAI gpt-4o-mini-tts — more natural than tts-1-hd
// Uses OPENAI_API_KEY env var, or x-oai-key header as fallback
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-oai-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.OPENAI_API_KEY || req.headers['x-oai-key'];
  if (!key || key === 'YOUR_OPENAI_KEY_HERE') {
    return res.status(503).json({ error: 'OpenAI not configured' });
  }

  const { text, voice = 'nova' } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        instructions: 'Speak like a smart, warm friend — natural rhythm, genuine tone, conversational pace. No robotic or formal delivery. Sound real.',
      }),
    });

    if (!r.ok) { const e = await r.text(); return res.status(r.status).json({ error: e }); }

    const buf = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).send(Buffer.from(buf));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
