const https = require('https');

function supabaseRequest(method, path, body, serviceKey, supabaseUrl) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${supabaseUrl}${path}`);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: r.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // GET - fetch notes for an account
  if (req.method === 'GET') {
    const accountName = req.query.account;
    if (!accountName) { res.status(400).json({ error: 'account required' }); return; }

    try {
      const encoded = encodeURIComponent(accountName);
      const result = await supabaseRequest(
        'GET',
        `/rest/v1/call_notes?account_name=eq.${encoded}&order=call_date.desc&limit=5`,
        null, serviceKey, supabaseUrl
      );
      const intel = await supabaseRequest(
        'GET',
        `/rest/v1/account_intelligence?account_name=eq.${encoded}`,
        null, serviceKey, supabaseUrl
      );
      res.status(200).json({
        notes: Array.isArray(result.data) ? result.data : [],
        intelligence: Array.isArray(intel.data) && intel.data.length > 0 ? intel.data[0] : null
      });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // POST - save call notes
  if (req.method === 'POST') {
    const { accountName, outcome, integrationsPitched, integrationsActivated, decisionMaker, notes } = req.body;
    if (!accountName) { res.status(400).json({ error: 'accountName required' }); return; }

    try {
      // Insert call note
      const noteResult = await supabaseRequest('POST', '/rest/v1/call_notes', {
        account_name: accountName,
        outcome,
        integrations_pitched: integrationsPitched || [],
        integrations_activated: integrationsActivated || [],
        decision_maker: decisionMaker || '',
        notes: notes || ''
      }, serviceKey, supabaseUrl);

      // Upsert account intelligence
      const intelResult = await supabaseRequest(
        'GET',
        `/rest/v1/account_intelligence?account_name=eq.${encodeURIComponent(accountName)}`,
        null, serviceKey, supabaseUrl
      );
      const existing = Array.isArray(intelResult.data) && intelResult.data.length > 0 ? intelResult.data[0] : null;

      const allPitched = [...new Set([...(existing?.integrations_pitched || []), ...(integrationsPitched || [])])];
      const allActivated = [...new Set([...(existing?.integrations_activated || []), ...(integrationsActivated || [])])];
      const prevNotes = existing?.cumulative_notes || '';
      const newNotes = `[${new Date().toLocaleDateString()}] Outcome: ${outcome || 'unknown'}. DM: ${decisionMaker || 'unknown'}. ${notes || ''}`;
      const cumulativeNotes = prevNotes ? `${prevNotes}\n${newNotes}` : newNotes;

      const intelPayload = {
        account_name: accountName,
        last_call_date: new Date().toISOString(),
        total_calls: (existing?.total_calls || 0) + 1,
        last_outcome: outcome,
        key_contacts: decisionMaker || existing?.key_contacts || '',
        integrations_pitched: allPitched,
        integrations_activated: allActivated,
        cumulative_notes: cumulativeNotes,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await supabaseRequest(
          'PATCH',
          `/rest/v1/account_intelligence?account_name=eq.${encodeURIComponent(accountName)}`,
          intelPayload, serviceKey, supabaseUrl
        );
      } else {
        await supabaseRequest('POST', '/rest/v1/account_intelligence', intelPayload, serviceKey, supabaseUrl);
      }

      res.status(200).json({ success: true });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
