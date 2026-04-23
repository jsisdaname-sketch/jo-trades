const crypto = require('crypto');

const BASE = 'https://api.snaptrade.com/api/v1';

function snapHeaders(path, bodyStr = '') {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = path + bodyStr + timestamp;
  const sig = crypto
    .createHmac('sha256', consumerKey.trim())
    .update(message)
    .digest('base64');
  return {
    'Content-Type': 'application/json',
    'clientId': clientId.trim(),
    'timestamp': timestamp,
    'Signature': sig,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!clientId || !consumerKey) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing API keys' }) };
  }

  const path = '/api/v1/snapTrade/registerUser';
  const userId = 'jo-trades-user-1';
  const bodyObj = { userId };
  const bodyStr = JSON.stringify(bodyObj);

  try {
    const res = await fetch(`${BASE}/snapTrade/registerUser`, {
      method: 'POST',
      headers: snapHeaders(path, bodyStr),
      body: bodyStr,
    });

    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (res.ok) {
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ userId: data.userId, userSecret: data.userSecret }) };
    }
    if (res.status === 409) {
      return { statusCode: 409, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'already_registered' }) };
    }
    return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Registration failed', details: data }) };

  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
