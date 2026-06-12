export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'dsaunders-debug';
  const repo  = process.env.GITHUB_REPO  || 'UTM-Builder';
  const path  = 'utm-links.json';

  if (!token) { res.status(500).json({ error: 'GITHUB_TOKEN not configured.' }); return; }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };

  // GET — read all links
  if (req.method === 'GET') {
    try {
      const r = await fetch(apiUrl, { headers });
      if (r.status === 404) { res.status(200).json({ links: [] }); return; }
      if (!r.ok) { res.status(r.status).json({ error: 'GitHub read error' }); return; }
      const d = await r.json();
      const links = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
      res.status(200).json({ links });
    } catch(e) {
      res.status(500).json({ error: 'Failed to read', detail: e.message });
    }
    return;
  }

  // POST — save entry (append or overwrite by sessionId) OR full replace for deletes
  if (req.method === 'POST') {
    const { entry, sessionId, links: replaceLinks, replace } = req.body;

    try {
      let links = [];
      let sha = null;

      const ex = await fetch(apiUrl, { headers });
      if (ex.ok) {
        const d = await ex.json();
        sha = d.sha;
        links = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
      }

      if (replace && Array.isArray(replaceLinks)) {
        // Full replace — used for deletes
        links = replaceLinks;
      } else if (entry) {
        if (sessionId) {
          const idx = links.findIndex(l => l.sessionId === sessionId);
          if (idx >= 0) {
            links[idx] = { ...entry, sessionId };
          } else {
            links.push({ ...entry, sessionId });
          }
        } else {
          links.push(entry);
        }
      }

      const content = Buffer.from(JSON.stringify(links, null, 2)).toString('base64');
      const body = {
        message: 'UTM links updated — ' + new Date().toISOString().slice(0, 10),
        content,
        committer: { name: 'Strive UTM Builder', email: 'utm@strivecompounding.com' }
      };
      if (sha) body.sha = sha;

      const r = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        res.status(r.status).json({ error: 'GitHub write error', detail: d.message });
        return;
      }
      res.status(200).json({ ok: true, total: links.length });
    } catch(e) {
      res.status(500).json({ error: 'Failed to save', detail: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
