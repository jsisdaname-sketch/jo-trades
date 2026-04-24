import { getStore } from "@netlify/blobs";
export const handler = async (event) => {
  try {
    const store = getStore({
      name: "jo-trades",
      consistency: "strong",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
    const trades = await store.get("trades", { type: "json" });
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ trades: trades || [] }) };
  } catch (e) {
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ trades: [], error: e.message }) };
  }
};
