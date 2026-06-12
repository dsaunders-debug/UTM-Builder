export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'dsaunders-debug';
  const repo  = process.env.GITHUB_REPO  || 'UTM-Builder';

  if (!token) { res.status(500).json({ error: 'GITHUB_TOKEN not configured in Vercel environment variables.' }); return; }

  const { links } = req.body;
  if (!links) { res.status(400).json({ error: 'Missing links payload.' }); return; }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/utm-links.json`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };

  try {
    let sha = null;
    const ex = await fetch(apiUrl, { headers });
    if (ex.ok) { const d = await ex.json(); sha = d.sha; }

    const content = Buffer.from(JSON.stringify(links, null, 2)).toString('base64');
    const body = {
      message: 'UTM link saved — ' + new Date().toISOString().slice(0, 10),
      content,
      committer: { name: 'Strive UTM Builder', email: 'utm@strivecompounding.com' }
    };
    if (sha) body.sha = sha;

    const r = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      res.status(r.status).json({ error: 'GitHub API error', detail: d.message || r.status });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save to GitHub', detail: e.message });
  }
}
