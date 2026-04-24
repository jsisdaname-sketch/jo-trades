exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      userId: 'JOTRADES',
      userSecret: process.env.SNAPTRADE_USER_SECRET
    })
  };
};
