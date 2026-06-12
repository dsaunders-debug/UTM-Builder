export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.HUBSPOT_API_KEY;
  if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not configured.' }); return; }

  try {
    // Service keys use hapikey query param, not Bearer auth
    // Try the v1 campaigns endpoint which service keys can still access
    const r = await fetch(
      `https://api.hubapi.com/campaigns/v1/campaigns?hapikey=${key}&limit=250`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!r.ok) {
      const text = await r.text();
      // Try email campaigns endpoint as fallback
      const r2 = await fetch(
        `https://api.hubapi.com/email/public/v1/campaigns?hapikey=${key}&limit=250`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!r2.ok) {
        const text2 = await r2.text();
        res.status(r.status).json({ 
          error: 'HubSpot API error on both endpoints', 
          v1Detail: text,
          emailDetail: text2
        });
        return;
      }
      const d2 = await r2.json();
      const campaigns = (d2.objects || []).map(c => ({
        id: String(c.id),
        name: c.name || String(c.id),
        utmCampaign: c.utmCampaign || c.name || String(c.id)
      })).sort((a, b) => a.name.localeCompare(b.name));
      res.status(200).json({ campaigns });
      return;
    }

    const data = await r.json();
    const raw = data.campaigns || data.results || data.objects || [];

    const campaigns = raw.map(c => {
      const name = c.name || c.campaignName || c.displayName || String(c.id);
      const utmCampaign = c.utmCampaign ||
        (c.id && name !== String(c.id)
          ? `${c.id}-${encodeURIComponent(name)}`
          : String(c.id));
      return { id: String(c.id), name, utmCampaign };
    }).sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ campaigns });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch campaigns', detail: e.message });
  }
}
