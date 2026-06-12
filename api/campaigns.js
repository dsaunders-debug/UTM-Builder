export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.HUBSPOT_API_KEY;
  if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not configured.' }); return; }

  const headers = {
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  try {
    const since = Date.now() - 50 * 24 * 60 * 60 * 1000;
    const sinceISO = new Date(since).toISOString().slice(0, 10);

    // Correct versioned endpoint per HubSpot docs, with hs_name and hs_utm
    const url = `https://api.hubapi.com/marketing/campaigns/2026-03?limit=100&properties=hs_name,hs_utm,hs_campaign_status&sort=-CREATED_AT`;

    const r = await fetch(url, { headers });

    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).json({ error: 'HubSpot API error', detail: text });
      return;
    }

    const data = await r.json();
    const raw = data.results || [];

    const campaigns = raw
      .filter(c => {
        // only include campaigns created in last 50 days
        const created = new Date(c.createdAt).getTime();
        return created >= since;
      })
      .map(c => {
        const props = c.properties || {};
        const name = props.hs_name || c.id;
        // hs_utm contains the full UTM campaign value
        const utmCampaign = props.hs_utm || name;
        return { id: c.id, name, utmCampaign };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ campaigns });
  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
}
