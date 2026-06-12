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

    // Log the first raw result so we can inspect the shape in Vercel logs
    if (data.results && data.results.length > 0) {
      console.log('Sample campaign object:', JSON.stringify(data.results[0], null, 2));
    }

    const campaigns = (data.results || []).map(c => {
      // HubSpot campaigns API returns displayName or name depending on version
      const name = c.displayName || c.name || c.campaignName || c.label || c.id;
      const utmCampaign = (c.utmParameters && c.utmParameters.utmCampaign)
        ? c.utmParameters.utmCampaign
        : (c.displayName || c.name || c.campaignName || c.label || c.id);
      return { id: c.id, name, utmCampaign, _raw: c };
    });

    res.status(200).json({ campaigns, _sampleRaw: data.results ? data.results[0] : null });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch campaigns', detail: e.message });
  }
}
