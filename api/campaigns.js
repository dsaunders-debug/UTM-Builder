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
    // Step 1: discover what properties actually exist on campaign objects
    const propsR = await fetch(
      'https://api.hubapi.com/crm/v3/properties/campaigns',
      { headers }
    );

    let nameField = 'hs_name';
    let utmField = null;

    if (propsR.ok) {
      const propsData = await propsR.json();
      const props = (propsData.results || []).map(p => p.name);

      // find the name field
      const nameCandidates = ['hs_name', 'hs_campaign_name', 'campaignname', 'campaign_name', 'name', 'label'];
      nameField = nameCandidates.find(c => props.includes(c)) || props[0];

      // find the utm field
      const utmCandidates = ['hs_utm_campaign', 'utm_campaign', 'hs_campaign_utm', 'utmcampaign'];
      utmField = utmCandidates.find(c => props.includes(c)) || null;
    }

    // Step 2: search campaigns with only valid properties
    const requestedProps = [nameField];
    if (utmField) requestedProps.push(utmField);

    const since = Date.now() - 50 * 24 * 60 * 60 * 1000;

    const searchBody = {
      filterGroups: [{
        filters: [{
          propertyName: 'hs_created_at',
          operator: 'GTE',
          value: String(since)
        }]
      }],
      properties: requestedProps,
      limit: 100,
      sorts: [{ propertyName: 'hs_created_at', direction: 'DESCENDING' }]
    };

    const r = await fetch('https://api.hubapi.com/crm/v3/objects/campaigns/search', {
      method: 'POST',
      headers,
      body: JSON.stringify(searchBody)
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(r.status).json({ error: 'CRM search failed', detail: errText, nameField, utmField });
      return;
    }

    const data = await r.json();
    const campaigns = (data.results || []).map(c => {
      const props = c.properties || {};
      const name = props[nameField] || c.id;
      const utmCampaign = (utmField && props[utmField]) || name;
      return { id: c.id, name, utmCampaign };
    }).sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ campaigns, _debug: { nameField, utmField } });

  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
}
