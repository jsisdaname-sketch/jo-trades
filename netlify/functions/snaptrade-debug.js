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

exports.handler = async () => {
  const userId = 'JOTRADES';
  const userSecret = process.env.SNAPTRADE_USER_SECRET;
  const extraQuery = `userId=${encodeURIComponent(userId)}&userSecret=${encodeURIComponent(userSecret)}`;
  const results = {};

  // Try different account endpoint variations
  const paths = [
    '/api/v1/accounts',
    '/api/v1/snapTrade/listUserAccounts',
  ];

  for (const path of paths) {
    try {
      const { url, signature } = buildRequest(path, null, extraQuery);
      const res = await fetch(url, { headers: { 'Signature': signature } });
      results[path] = { status: res.status, body: await res.text() };
    } catch(e) { results[path] = { error: e.message }; }
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(results, null, 2)
  };
};
