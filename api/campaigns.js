export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.HUBSPOT_API_KEY;
  if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not configured.' }); return; }

  const since = Date.now() - 50 * 24 * 60 * 60 * 1000;

  try {
    // Step 1: get campaign list from v3
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

    // Step 2: fetch each campaign's details to get the real name
    // HubSpot v3 campaign detail endpoint returns campaignName
    const detailed = await Promise.all(
      raw.map(async (c) => {
        try {
          const dr = await fetch(
            `https://api.hubapi.com/marketing/v3/campaigns/${c.id}`,
            { headers: { 'Authorization': 'Bearer ' + key } }
          );
          if (dr.ok) {
            const d = await dr.json();
            return { ...c, ...d };
          }
        } catch(e) {}
        return c;
      })
    );

    const campaigns = detailed.map(c => {
      // Try every possible name field from the detail response
      const name =
        c.campaignName ||
        c.displayName ||
        (c.properties && (c.properties.hs_name || c.properties.name)) ||
        null;

      // UTM — use the raw utmCampaign value exactly as HubSpot stores it
      const utmCampaign =
        (c.utmParameters && c.utmParameters.utmCampaign) ||
        (name ? encodeURIComponent(name) : c.id);

      // derive display name from utmCampaign if still no name
      let displayName = name;
      if (!displayName && c.utmParameters && c.utmParameters.utmCampaign) {
        try {
          const decoded = decodeURIComponent(c.utmParameters.utmCampaign);
          const match = decoded.match(/^\d+-(.+)$/);
          displayName = match ? match[1] : decoded;
        } catch(e) { displayName = c.utmParameters.utmCampaign; }
      }

      return {
        id: c.id,
        name: displayName || c.id,
        utmCampaign
      };
    });

    campaigns.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ campaigns });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch campaigns', detail: e.message });
  }
}
