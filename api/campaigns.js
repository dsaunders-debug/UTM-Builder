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

  const since = Date.now() - 50 * 24 * 60 * 60 * 1000;
  const sinceISO = new Date(since).toISOString();

  try {
    // Try CRM search API for campaigns object — Service Keys have CRM access
    const searchBody = {
      filterGroups: [{
        filters: [{
          propertyName: 'hs_created_at',
          operator: 'GTE',
          value: String(since)
        }]
      }],
      properties: ['hs_name', 'hs_utm_campaign', 'hs_campaign_name', 'name', 'utm_campaign'],
      limit: 100,
      sorts: [{ propertyName: 'hs_created_at', direction: 'DESCENDING' }]
    };

    const r = await fetch('https://api.hubapi.com/crm/v3/objects/campaigns/search', {
      method: 'POST',
      headers,
      body: JSON.stringify(searchBody)
    });

    if (r.ok) {
      const data = await r.json();
      const campaigns = (data.results || []).map(c => {
        const props = c.properties || {};
        const name = props.hs_name || props.hs_campaign_name || props.name || c.id;
        const utmCampaign = props.hs_utm_campaign || props.utm_campaign || name;
        return { id: c.id, name, utmCampaign };
      }).sort((a, b) => a.name.localeCompare(b.name));
      res.status(200).json({ campaigns });
      return;
    }

    // Fallback: v3 campaigns with ALL properties requested
    const r2 = await fetch(
      `https://api.hubapi.com/marketing/v3/campaigns?limit=100&createdAfter=${since}&properties=hs_name,name,hs_campaign_name,hs_utm_campaign,utm_campaign,displayName,campaignName`,
      { headers }
    );

    if (r2.ok) {
      const data2 = await r2.json();
      const raw = data2.results || [];

      // For each campaign fetch its full detail record to get all properties
      const detailed = await Promise.allSettled(
        raw.slice(0, 50).map(c =>
          fetch(`https://api.hubapi.com/marketing/v3/campaigns/${c.id}?properties=hs_name,name,hs_campaign_name,hs_utm_campaign,utm_campaign,displayName,campaignName`, { headers })
            .then(r => r.ok ? r.json() : c)
            .catch(() => c)
        )
      );

      const campaigns = detailed.map((result, i) => {
        const c = result.status === 'fulfilled' ? result.value : raw[i];
        const props = c.properties || {};
        const name =
          props.hs_name ||
          props.hs_campaign_name ||
          props.name ||
          props.displayName ||
          props.campaignName ||
          c.displayName ||
          c.campaignName ||
          null;

        const rawUtm = (c.utmParameters && c.utmParameters.utmCampaign) ||
          props.hs_utm_campaign ||
          props.utm_campaign ||
          null;

        // Parse name from UTM if still nothing (format: "46301304-Campaign Name")
        let displayName = name;
        if (!displayName && rawUtm) {
          try {
            const decoded = decodeURIComponent(rawUtm);
            const match = decoded.match(/^\d+-(.+)$/);
            displayName = match ? match[1] : decoded;
          } catch(e) { displayName = rawUtm; }
        }

        return {
          id: c.id,
          name: displayName || c.id,
          utmCampaign: rawUtm || displayName || c.id
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      res.status(200).json({ campaigns });
      return;
    }

    const errText = await r2.text();
    res.status(500).json({ error: 'All HubSpot endpoints failed', detail: errText });

  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
}
