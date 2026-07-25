// Netlify Function — proxy ke 21Express tracking API (bypass CORS)
exports.handler = async (event) => {
  const resi = (event.queryStringParameters || {}).resi;
  if (!resi) {
    return { statusCode: 400, body: JSON.stringify({ error: 'resi required' }) };
  }

  try {
    const url = `https://partner-api.21express.co.id/siscos/tracking/multitrack?resi_no=${encodeURIComponent(resi)}`;
    const resp = await fetch(url, {
      headers: {
        'Origin'  : 'https://uat.21express.co.id',
        'Referer' : 'https://uat.21express.co.id/',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = await resp.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
