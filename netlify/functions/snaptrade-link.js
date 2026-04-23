const crypto = require('crypto');

const BASE = 'https://api.snaptrade.com/api/v1';

function snapHeaders(path, bodyStr = '') {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = path + bodyStr + timestamp;
  const sig = crypto.createHmac('sha256', consumerKey).update(message).digest('hex');
  return {
    'Content-Type': 'application/json',
    'clientId': clientId,
    'timestamp': timestamp,
    'Signature': sig,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }

  const { userId, userSecret } = JSON.parse(event.body || '{}');

  if (!userId || !userSecret) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing userId or userSecret' }) };
  }

  const path = '/api/v1/snapTrade/login';
  const bodyObj = {
    userId,
    userSecret,
    broker: 'ROBINHOOD',
    immediateRedirect: true,
    customRedirect: 'https://idyllic-druid-6826b0.netlify.app/robinhood-sync',
  };
  const bodyStr = JSON.stringify(bodyObj);

  try {
    const res = await fetch(`${BASE}/snapTrade/login`, {
      method: 'POST',
      headers: snapHeaders(path, bodyStr),
      body: bodyStr,
    });

    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ redirectURI: data.redirectURI }),
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: e.message };
  }
};
