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

exports.handler = async () => {
  const path = '/api/v1/snapTrade/registerUser';
  const userId = 'jo-trades-user';
  const bodyObj = { userId };
  const bodyStr = JSON.stringify(bodyObj);

  try {
    const res = await fetch(`${BASE}/snapTrade/registerUser`, {
      method: 'POST',
      headers: snapHeaders(path, bodyStr),
      body: bodyStr,
    });

    // 200/201 = newly registered, returns userSecret
    if (res.ok) {
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ userId: data.userId, userSecret: data.userSecret }),
      };
    }

    // 409 = user already exists, client must use stored userSecret
    if (res.status === 409) {
      return {
        statusCode: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'already_registered' }),
      };
    }

    const err = await res.text();
    return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: err };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: e.message };
  }
};
