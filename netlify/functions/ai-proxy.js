// ERA-VIS — Claude API Proxy (Netlify Function)
// API key aman di server — tidak terekspos ke browser
// Set: Netlify Dashboard → Site Configuration → Environment Variables → ANTHROPIC_API_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY belum dikonfigurasi di Netlify Environment Variables.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { messages, system, max_tokens = 400, model = 'claude-haiku-4-5-20251001' } = body;

  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'messages harus berupa array' }) };
  }

  // Token guard
  if (max_tokens > 1024) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'max_tokens maksimal 1024' }) };
  }

  const payload = { model, max_tokens, messages };
  if (system) payload.system = system;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: 502, headers,
      body: JSON.stringify({ error: 'Gagal menghubungi Claude API: ' + err.message })
    };
  }
};
