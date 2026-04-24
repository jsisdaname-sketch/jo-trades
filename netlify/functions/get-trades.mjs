export const handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ siteID: process.env.NETLIFY_SITE_ID, hasToken: !!process.env.NETLIFY_AUTH_TOKEN, tokenLength: (process.env.NETLIFY_AUTH_TOKEN || '').length })
  };
};
