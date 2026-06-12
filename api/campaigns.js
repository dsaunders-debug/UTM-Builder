export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.HUBSPOT_API_KEY;
  if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not configured.' }); return; }

  const since = Date.now() - 50 * 24 * 60 * 60 * 1000;

  try {
    const r = await fetch(
      `https://api.hubapi.com/marketing/v3/campaigns?limit=100&createdAfter=${since}`,
      { headers: { 'Authorization': 'Bearer ' + key } }
    );
    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).json({ error: 'HubSpot API error', detail: text });
      return;
    }
    const data = await r.json();
    const raw = data.results || [];

    const campaigns = raw.map(c => {
      // utmCampaign looks like "46301304-Womens%20Health%20Month%20%7C%20May%202026"
      // decode it and strip the leading numeric ID to get the display name
      const rawUtm = (c.utmParameters && c.utmParameters.utmCampaign) ? c.utmParameters.utmCampaign : null;

      let displayName = null;
      if (rawUtm) {
        try {
          const decoded = decodeURIComponent(rawUtm);
          // strip leading "XXXXXXXX-" numeric prefix if present
          const match = decoded.match(/^\d+-(.+)$/);
          displayName = match ? match[1] : decoded;
        } catch(e) {
          displayName = rawUtm;
        }
      }

      // fallback chain
      const name = displayName || c.displayName || c.name || c.id;

      return {
        id: c.id,
        name,
        utmCampaign: rawUtm || name
      };
    });

    // sort alphabetically by name
    campaigns.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ campaigns });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch campaigns', detail: e.message });
  }
}
