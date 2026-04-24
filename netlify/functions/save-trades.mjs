import { getStore } from "@netlify/blobs";
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  try {
    const body = JSON.parse(event.body);
    const store = getStore({
      name: "jo-trades",
      consistency: "strong",
      siteID: "1e22ab49-ea92-44a8-929a-bd8ce89932df",
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
    if (body.trades !== undefined) await store.setJSON("trades", body.trades);
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
