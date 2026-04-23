const crypto = require('crypto');
const BASE = 'https://api.snaptrade.com/api/v1';

exports.handler = async (event) => {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  // Step 1: confirm keys exist
  if (!clientId || !consumerKey) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ step: 'FAILED', reason: 'Keys missing from environment variables' })
    };
  }

  const clientIdClean = clientId.trim();
  const consumerKeyClean = consumerKey.trim();
  const consumerKeyEncoded = encodeURI(consumerKeyClean);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = '/api/v1/snapTrade/registerUser';
  const bodyObj = { userId: 'jo-trades-debug-1' };
  const query = `clientId=${clientIdClean}&timestamp=${timestamp}`;
  const sigObject = { content: bodyObj, path, query };
  const sigContent = JSON.stringify(sigObject);
  const signature = crypto.createHmac('sha256', consumerKeyEncoded).update(sigContent).digest('base64');

  try {
    const res = await fetch(`${BASE}/snapTrade/registerUser?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Signature': signature },
      body: JSON.stringify(bodyObj),
    });
    const rawText = await res.text();

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        httpStatus: res.status,
        clientIdLength: clientIdClean.length,
        consumerKeyLength: consumerKeyClean.length,
        signaturePreview: signature.slice(0, 20) + '...',
        snapTradeResponse: rawText
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ step: 'FETCH_ERROR', error: e.message })
    };
  }
};
