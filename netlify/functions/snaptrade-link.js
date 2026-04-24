const { Snaptrade } = require('snaptrade-typescript-sdk');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const snaptrade = new Snaptrade({
      clientId: process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
    });

    const userId = 'JOTRADES';
    const userSecret = process.env.SNAPTRADE_USER_SECRET;

    const response = await snaptrade.authentication.loginSnapTradeUser({
      userId,
      userSecret,
      broker: 'ROBINHOOD',
      immediateRedirect: true,
      customRedirect: 'https://idyllic-druid-6826b0.netlify.app/robinhood-sync',
    });

    const redirectURI = response.data?.redirectURI;
    if (!redirectURI) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No redirectURI returned', data: response.data })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ redirectURI })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message, detail: e.responseBody || '' })
    };
  }
};
