const crypto = require('crypto');
const BASE = 'https://api.snaptrade.com/api/v1';

function buildRequest(path, bodyObj = null) {
  const clientId = process.env.SNAPTRADE_CLIENT_ID.trim();
  const consumerKey = encodeURI(process.env.SNAPTRADE_CONSUMER_KEY.trim());
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query = `clientId=${clientId}&timestamp=${timestamp}`;
  const sigObject = { content: bodyObj || {}, path, query };
  const sigContent = JSON.stringify(sigObject);
  const signature = crypto.createHmac('sha256', consumerKey).update(sigContent).digest('base64');
  return { url: `${BASE}${path}?${query}`, signature, timestamp };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing API keys in Netlify environment variables' }) };

  const path = '/api/v1/snapTrade/registerUser';
  const bodyObj = { userId: 'jo-trades-user-1' };
  const { url, signature } = buildRequest(path, bodyObj);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': signature },
      body: JSON.stringify(bodyObj),
    });
    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (res.ok) return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ userId: data.userId, userSecret: data.userSecret }) };
    if (res.status === 409) return { statusCode: 409, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'already_registered' }) };
    return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Registration failed', details: data }) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
