const crypto = require('crypto');
const BASE = 'https://api.snaptrade.com/api/v1';

exports.handler = async () => {
  const clientId = process.env.SNAPTRADE_CLIENT_ID.trim();
  const consumerKey = encodeURI(process.env.SNAPTRADE_CONSUMER_KEY.trim());
  const userId = 'JOTRADES';
  const userSecret = process.env.SNAPTRADE_USER_SECRET.trim();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const path = '/api/v1/snapTrade/login';
  const bodyObj = {
    broker: 'ROBINHOOD',
    immediateRedirect: true,
    customRedirect: 'https://idyllic-druid-6826b0.netlify.app/robinhood-sync',
  };

  // userId and userSecret must be in query AND included in signature query string
  const query = `clientId=${clientId}&timestamp=${timestamp}&userId=${encodeURIComponent(userId)}&userSecret=${encodeURIComponent(userSecret)}`;
  const sigObject = { content: bodyObj, path, query };
  const signature = crypto.createHmac('sha256', consumerKey).update(JSON.stringify(sigObject)).digest('base64');
  const url = `${BASE}${path}?${query}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': signature },
      body: JSON.stringify(bodyObj),
    });
    const text = await res.text();
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: res.status, response: text })
    };
  } catch(e) {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
