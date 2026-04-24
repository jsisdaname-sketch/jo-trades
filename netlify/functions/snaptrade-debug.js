exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      HAS_CLIENT_ID: !!process.env.SNAPTRADE_CLIENT_ID,
      HAS_CONSUMER_KEY: !!process.env.SNAPTRADE_CONSUMER_KEY,
      HAS_USER_SECRET: !!process.env.SNAPTRADE_USER_SECRET,
      ALL_SNAPTRADE_KEYS: Object.keys(process.env).filter(k => k.includes('SNAP'))
    })
  };
};
