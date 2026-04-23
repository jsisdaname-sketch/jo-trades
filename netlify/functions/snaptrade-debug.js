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
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing API keys' }) };

  // Personal keys only allow 1 user — list existing users and return that one
  try {
    // First try to list existing users
    const listPath = '/api/v1/snapTrade/listUsers';
    const { url: listUrl, signature: listSig } = buildRequest(listPath, null, '');
    const listRes = await fetch(listUrl, { headers: { 'Signature': listSig } });
    const listText = await listRes.text();
    let users;
    try { users = JSON.parse(listText); } catch { users = null; }

    if (listRes.ok && Array.isArray(users) && users.length > 0) {
      // User already exists — we need to delete and re-register to get a fresh userSecret
      // OR we can try to reset the user secret
      const existingUserId = users[0];

      // Reset the user secret to get a new one
      const resetPath = '/api/v1/snapTrade/resetUserSecret';
      const resetBody = { userId: existingUserId, userSecret: 'placeholder' };
      // Actually use deleteUserAndCreate approach - delete then register fresh
      // Delete existing user first
      const deletePath = '/api/v1/snapTrade/deleteUser';
      const deleteBody = { userId: existingUserId };
      const { url: deleteUrl, signature: deleteSig } = buildRequest(deletePath, deleteBody);
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Signature': deleteSig },
        body: JSON.stringify(deleteBody),
      });
    }

    // Now register fresh
    const regPath = '/api/v1/snapTrade/registerUser';
    const regBody = { userId: 'jo-trades-user-1' };
    const { url: regUrl, signature: regSig } = buildRequest(regPath, regBody);
    const regRes = await fetch(regUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': regSig },
      body: JSON.stringify(regBody),
    });
    const regText = await regRes.text();
    let regData;
    try { regData = JSON.parse(regText); } catch { regData = { raw: regText }; }

    if (regRes.ok) {
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ userId: regData.userId, userSecret: regData.userSecret }) };
    }

    return { statusCode: regRes.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Registration failed', details: regData }) };

  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
