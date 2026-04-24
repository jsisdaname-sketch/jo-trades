const crypto = require('crypto');
const BASE = 'https://api.snaptrade.com/api/v1';

function buildRequest(path, bodyObj = null, extraQuery = '') {
  const clientId = process.env.SNAPTRADE_CLIENT_ID.trim();
  const consumerKey = encodeURI(process.env.SNAPTRADE_CONSUMER_KEY.trim());
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query = `clientId=${clientId}&timestamp=${timestamp}${extraQuery ? '&' + extraQuery : ''}`;
  const sigObject = { content: bodyObj || {}, path, query };
  const signature = crypto.createHmac('sha256', consumerKey).update(JSON.stringify(sigObject)).digest('base64');
  return { url: `${BASE}${path}?${query}`, signature };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const userId = 'JOTRADES';
  const userSecret = process.env.SNAPTRADE_USER_SECRET;

  const path = '/api/v1/snapTrade/login';
  const bodyObj = {
    broker: 'ROBINHOOD',
    immediateRedirect: true,
    customRedirect: 'https://idyllic-druid-6826b0.netlify.app/robinhood-sync',
  };

  // userId and userSecret go in query string for this endpoint
  const extraQuery = `userId=${encodeURIComponent(userId)}&userSecret=${encodeURIComponent(userSecret)}`;
  const { url, signature } = buildRequest(path, bodyObj, extraQuery);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': signature },
      body: JSON.stringify(bodyObj),
    });
    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!res.ok) {
      return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Link failed', details: data }) };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ redirectURI: data.redirectURI })
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
