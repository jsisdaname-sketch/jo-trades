exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const userId = 'JOTRADES';
  const userSecret = process.env.SNAPTRADE_USER_SECRET;

  if (!userSecret) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'SNAPTRADE_USER_SECRET missing from Netlify environment variables' })
    };
  }

  // Just return the stored credentials directly — no registration needed
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ userId, userSecret })
  };
};
