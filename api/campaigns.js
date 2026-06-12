export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.HUBSPOT_API_KEY;
  if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not configured in Vercel environment variables.' }); return; }

  const since = Date.now() - 50 * 24 * 60 * 60 * 1000;
  try {
    const r = await fetch(`https://api.hubapi.com/marketing/v3/campaigns?limit=100&createdAfter=${since}`, {
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
    });
    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).json({ error: 'HubSpot API error', detail: text });
      return;
    }
    const data = await r.json();
    const campaigns = (data.results || []).map(c => ({
      id: c.id,
      name: c.name || c.id,
      utmCampaign: (c.utmParameters && c.utmParameters.utmCampaign)
        ? c.utmParameters.utmCampaign
        : (c.name || c.id)
    }));
    res.status(200).json({ campaigns });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch campaigns', detail: e.message });
  }
}
